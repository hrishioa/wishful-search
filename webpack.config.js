const path = require('path');

module.exports = {
  entry: './src/index.browser.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: { configFile: 'tsconfig.browser.json' },
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      path: false,
      fs: false,
    },
  },
  output: {
    filename: 'wishful-search.js',
    path: path.resolve(__dirname, 'release'),
    library: 'WishfulSearch',
    libraryTarget: 'umd',
  },
  externals: {
    'sql.js': 'commonjs sql.js',
  },
};
