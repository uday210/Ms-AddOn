@RestResource(urlMapping='/AgentProxy/*')
global class AgentProxyController {

    private static final String AGENT_BASE = 'https://api.salesforce.com/einstein/ai-agent/v1';
    private static final String AGENT_ID   = '0Xxg7000000TG7pCAG'; // PA_Outlook_Agent

    @HttpPost
    global static void handleRequest() {
        RestResponse res = RestContext.response;
        res.addHeader('Content-Type', 'application/json');

        try {
            String bodyStr = RestContext.request.requestBody.toString();
            Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(bodyStr);

            String userMessage  = (String)  body.get('userMessage');
            String sfSessionId  = (String)  body.get('sfSessionId');
            Integer sequenceId  = body.get('sequenceId') != null
                                  ? Integer.valueOf(String.valueOf(body.get('sequenceId')))
                                  : 0;
            Map<String, Object> emailCtx = (Map<String, Object>) body.get('emailContext');

            // Prefer the token passed from the backend (has einstein_gpt_api scope).
            // UserInfo.getSessionId() returns a session ID that may lack that scope.
            String passedToken = (String) body.get('accessToken');
            String token = String.isNotBlank(passedToken) ? passedToken : UserInfo.getSessionId();

            // Create session if this is the first message
            if (String.isBlank(sfSessionId)) {
                sfSessionId = createSession(token, emailCtx);
                // Seed session with email context
                String ctx = buildEmailContext(emailCtx);
                sequenceId += 1;
                sendMessage(token, sfSessionId, ctx, sequenceId);
            }

            // Send the user's message
            sequenceId += 1;
            String agentReply = sendMessage(token, sfSessionId, userMessage, sequenceId);

            Map<String, Object> result = new Map<String, Object>{
                'reply'       => String.isNotBlank(agentReply) ? agentReply : '(no response from agent)',
                'sfSessionId' => sfSessionId,
                'sequenceId'  => sequenceId
            };

            res.statusCode = 200;
            res.responseBody = Blob.valueOf(JSON.serialize(result));

        } catch (Exception e) {
            res.statusCode = 500;
            res.responseBody = Blob.valueOf(JSON.serialize(new Map<String, Object>{
                'error' => e.getMessage()
            }));
        }
    }

    // ── Create Agentforce session ─────────────────────────────────────────────
    private static String createSession(String token, Map<String, Object> emailCtx) {
        String externalKey = EncodingUtil.convertToHex(Crypto.generateAesKey(128)).substring(0, 32);

        Map<String, Object> payload = new Map<String, Object>{
            'externalSessionKey'      => externalKey,
            'instanceConfig'          => new Map<String, Object>{
                'endpoint' => URL.getOrgDomainUrl().toExternalForm()
            },
            'streamingCapabilities'   => new Map<String, Object>{
                'chunkTypes' => new List<String>{ 'Text' }
            },
            'bypassUser'              => true
        };

        HttpRequest req = new HttpRequest();
        req.setEndpoint(AGENT_BASE + '/agents/' + AGENT_ID + '/sessions');
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('x-client-name', 'afdx');
        req.setBody(JSON.serialize(payload));
        req.setTimeout(30000);

        HttpResponse resp = new Http().send(req);
        if (resp.getStatusCode() != 200 && resp.getStatusCode() != 201) {
            throw new AgentProxyException('createSession ' + resp.getStatusCode() + ': ' + resp.getBody());
        }

        Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(resp.getBody());
        return (String) data.get('sessionId');
    }

    // ── Send message, return agent reply text ─────────────────────────────────
    private static String sendMessage(String token, String sessionId, String text, Integer seqId) {
        Map<String, Object> payload = new Map<String, Object>{
            'message'   => new Map<String, Object>{
                'sequenceId' => seqId,
                'type'       => 'Text',
                'text'       => text
            },
            'variables' => new List<Object>()
        };

        HttpRequest req = new HttpRequest();
        req.setEndpoint(AGENT_BASE + '/sessions/' + sessionId + '/messages');
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + token);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Accept', 'application/json');
        req.setHeader('x-client-name', 'afdx');
        req.setBody(JSON.serialize(payload));
        req.setTimeout(30000);

        HttpResponse resp = new Http().send(req);
        if (resp.getStatusCode() < 200 || resp.getStatusCode() >= 300) {
            throw new AgentProxyException('sendMessage ' + resp.getStatusCode() + ': ' + resp.getBody());
        }

        String contentType = resp.getHeader('Content-Type') ?? '';
        return contentType.contains('text/event-stream')
               ? parseSSE(resp.getBody())
               : extractText(resp.getBody());
    }

    // ── Build email context string ─────────────────────────────────────────────
    private static String buildEmailContext(Map<String, Object> ctx) {
        if (ctx == null) return '';
        return 'Email context:\n'
            + 'Subject: '      + (ctx.get('subject')      ?? '') + '\n'
            + 'From: '         + (ctx.get('from')         ?? '') + '\n'
            + 'Body preview: ' + (ctx.get('bodyPreview')  ?? '');
    }

    // ── Parse SSE response ────────────────────────────────────────────────────
    private static String parseSSE(String raw) {
        List<String> chunks = new List<String>();
        for (String line : raw.split('\n')) {
            if (!line.startsWith('data: ')) continue;
            String payload = line.substring(6).trim();
            if (payload == '[DONE]') break;
            try {
                Map<String, Object> d = (Map<String, Object>) JSON.deserializeUntyped(payload);
                String t = extractTextFromMap(d);
                if (String.isNotBlank(t)) chunks.add(t);
            } catch (Exception e) { /* skip malformed */ }
        }
        return String.join(chunks, '');
    }

    // ── Extract text from JSON response body ──────────────────────────────────
    private static String extractText(String body) {
        try {
            Map<String, Object> d = (Map<String, Object>) JSON.deserializeUntyped(body);
            String t = extractTextFromMap(d);
            return String.isNotBlank(t) ? t : body;
        } catch (Exception e) {
            return body;
        }
    }

    private static String extractTextFromMap(Map<String, Object> d) {
        if (d.containsKey('text')    && d.get('text')    != null) return (String) d.get('text');
        if (d.containsKey('message') && d.get('message') != null) return (String) d.get('message');
        if (d.containsKey('messages')) {
            List<String> parts = new List<String>();
            for (Object m : (List<Object>) d.get('messages')) {
                Map<String, Object> msg = (Map<String, Object>) m;
                if (msg.containsKey('text') && msg.get('text') != null) parts.add((String) msg.get('text'));
            }
            return String.join(parts, '\n');
        }
        return '';
    }

    public class AgentProxyException extends Exception {}
}
