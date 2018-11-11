# slf-js
A JavaScript Selafin reader and writer ([OpenTelemac](https://opentelemac.org)).

## Install

Install using NPM (`npm install slf-js`), then:

```js
// import as a ES module
import Selafin from 'slf-js';

// or require in Node / Browserify
const Selafin = require('slf-js');
```

Or use a browser build directly:

```html
<script src="https://unpkg.com/slfjs@0.0.5/slfjs.min.js"></script>
```

## Usage

#### new Selafin([buffer, options])

Creates a Selafin object.

1. `buffer` : Buffer/Binary data container the selafin object.
1. `options`: Options.
- `debug`: Debug mode, `false` by default.
- `fromProj`: Orginal projection. `EPSG:4326` by default.
- `toProj`: Transformation projection. `EPSG:4326` by default.

```js
const slf = new Selafin(); // new without any file/buffer
const slf = new Selafin(buffer,{debug:true}); // from file/buffer
```

#### Selafin Properties

- `MESHX` : X Coordinate.
- `MESHY` : Y Coordinate.


## Options
Empty


## Compile, Test, Benchmark Cases
```js

npm run test
npm run build
```

## Examples
Empty

## History
0.0.5 - Created selafingl (webgl) and selafinmp(webgl+mapbox)

## TODO
- Complete readme
- Complete and have better test cases
- Not sure if Proj4 should be in here

## License




