const path = require('path');

module.exports = {
  entry: './src/index.ts',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'wishful-search.js',
    path: path.resolve(__dirname, 'dist/browser'),
    library: 'WishfulSearch',
    libraryTarget: 'umd',
  },
  externals: {
    'sql.js': 'commonjs sql.js',
  },
};
