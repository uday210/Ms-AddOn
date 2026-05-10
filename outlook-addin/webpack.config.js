const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");
const path = require("path");

module.exports = (env, argv) => {
  const isProd = argv.mode === "production";

  return {
    entry: "./src/taskpane/taskpane.tsx",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "bundle.js",
      clean: true,
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js"],
    },
    module: {
      rules: [
        { test: /\.tsx?$/, use: "ts-loader", exclude: /node_modules/ },
        { test: /\.css$/, use: ["style-loader", "css-loader"] },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: "./src/taskpane/taskpane.html",
        filename: "taskpane.html",
      }),
      new webpack.DefinePlugin({
        __BACKEND_URL__: JSON.stringify(
          process.env.BACKEND_URL ||
            (isProd ? "" : "http://localhost:3001")
        ),
      }),
    ],
    devServer: {
      port: 3000,
      server: "https",
      allowedHosts: "all",
      headers: { "Access-Control-Allow-Origin": "*" },
      static: [
        { directory: path.resolve(__dirname, "dist") },
        { directory: path.resolve(__dirname, "public") },
      ],
      client: { overlay: false },
    },
  };
};
