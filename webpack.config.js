const webpack = require('webpack');
const path = require('path');

const entrypath = './src/index.js';
const outpath =path.join(__dirname, 'build');


module.exports = {
  entry: {
    index: entrypath,
  },

  output: {
    path: outpath,
    filename: "slf-js.js",
  },
  devtool: 'source-map',
  module: {
    rules: [
      { test: /\.css$/,use: ['style-loader', 'css-loader']},
      { test: /\.scss$/, use: ['style-loader', 'css-loader', "sass-loader"]},
      { test: /\.woff(2)?(\?v=[0-9]\.[0-9]\.[0-9])?$/, loader: "url-loader?limit=10000&mimetype=application/font-woff" },
      { test: /\.(ttf|eot|svg)(\?v=[0-9]\.[0-9]\.[0-9])?$/, loader: "file-loader" },
      { test: /\.(png|jpg|gif|slf)$/,use: [{loader: 'file-loader',options: {}}]},
      // { test: /\.(glsl|frag|vert)$/, loader: 'raw', exclude: /node_modules/ },
      {test: /\.glsl$/,loader: 'webpack-glsl-loader'}
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({
      Promise: ['es6-promise', 'Promise']
    }),
  ]
};
