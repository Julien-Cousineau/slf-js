import {terser} from 'rollup-plugin-terser';
import buble from 'rollup-plugin-buble';

const config = (file, plugins) => ({
    input: 'src/index.js',
    output: {
        name: 'slf-js',
        format: 'umd',
        indent: false,
        file
    },
    plugins
});

export default [
    config('build/slf.js', [buble()]),
    config('build/slf.min.js', [terser(), buble()])
];