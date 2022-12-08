import {terser} from 'rollup-plugin-terser';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import buble from '@rollup/plugin-buble';

const output = (file, plugins) => ({
    input: 'src/index.js',
    output: {
        name: 'slf',
        format: 'umd',
        indent: false,
        file
        
    },
    plugins
});

export default [
    output('slf.js', [resolve(), buble(),commonjs()]),
    output('slf.min.js', [resolve(), buble(),commonjs(), terser()])
];