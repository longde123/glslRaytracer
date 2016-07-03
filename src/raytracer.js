/* global THREE */
import World from './world/world';
import Box from './entity/box';
import primitives from './primitives/index';

class Raytracer {
    constructor(light = [0,4,0]) {
        this._primitives = [];
        this._lightPosition = light;
        this._sCount = 0;
        this._tCount = 0;
    }

    add(p) {
        if (p instanceof primitives.Sphere) {
            this._sCount++;
        } else if (p instanceof primitives.Triangle) {
            this._tCount++;
        } else {
            console.warn('Unknown primitive type');
            return;
        }
        this._primitives.push(p);
    }

    go() {
        this.world = new World('raytracer', { element: '#raytracer' });

        $('#raytracer').append(this.world.panel);
        this.world.setSize();

        var numPrimitives = this._primitives.length;

        var primitivePtrs = new Float32Array(numPrimitives*1*4)

        var pinfoPixels = this._sCount*3 + this._tCount*5;
        if (pinfoPixels > 1024) {
            console.error('TOO MANY PRIMITIVES (pInfo > 1024 not supported yet...)');
        }
        var primitiveInfo = new Float32Array(pinfoPixels*1*4);
        var pixCount = 0;
        for (var i = 0; i < numPrimitives; i++) {

            primitivePtrs[4*i+0] = pixCount;
            primitivePtrs[4*i+1] = -1;
            primitivePtrs[4*i+2] = -1;
            primitivePtrs[4*i+3] = -1;

            var p = this._primitives[i];

            var type = -1;
            if (p instanceof primitives.Triangle) {
                type = 0;
            } else if (p instanceof primitives.Sphere) {
                type = 1;
            } else {
                console.warn('Unknown primitive. Should never reach here');
                continue;
            }

            primitiveInfo[4*pixCount+0] = type;
            primitiveInfo[4*pixCount+1] = ['NORMAL', 'MIRROR', 'GLASS'].indexOf(p.type);
            primitiveInfo[4*pixCount+2] = 0;
            primitiveInfo[4*pixCount+3] = 0;
            ++pixCount;
            primitiveInfo[4*pixCount+0] = p.color[0];
            primitiveInfo[4*pixCount+1] = p.color[1];
            primitiveInfo[4*pixCount+2] = p.color[2];
            primitiveInfo[4*pixCount+3] = 1;
            ++pixCount;

            if (type === 0) {
                // TRIANGLE CASE (A,B,C)
                primitiveInfo[4*pixCount+0] = p.a[0];
                primitiveInfo[4*pixCount+1] = p.a[1];
                primitiveInfo[4*pixCount+2] = p.a[2];
                primitiveInfo[4*pixCount+3] = 0;
                ++pixCount;
                primitiveInfo[4*pixCount+0] = p.b[0];
                primitiveInfo[4*pixCount+1] = p.b[1];
                primitiveInfo[4*pixCount+2] = p.b[2];
                primitiveInfo[4*pixCount+3] = 0;
                ++pixCount;
                primitiveInfo[4*pixCount+0] = p.c[0];
                primitiveInfo[4*pixCount+1] = p.c[1];
                primitiveInfo[4*pixCount+2] = p.c[2];
                primitiveInfo[4*pixCount+3] = 0;
                ++pixCount;
            } else if (type === 1) {
                // SPHERE CASE
                primitiveInfo[4*pixCount+0] = p.center[0];
                primitiveInfo[4*pixCount+1] = p.center[1];
                primitiveInfo[4*pixCount+2] = p.center[2];
                primitiveInfo[4*pixCount+3] = p.radius;
                ++pixCount;
            }
        }

        var dt_ptr = new THREE.DataTexture(primitivePtrs, numPrimitives, 1, THREE.RGBAFormat, THREE.FloatType, THREE.UVMapping,THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
        dt_ptr.flipY = false;
        dt_ptr.needsUpdate = true;


        var dt = new THREE.DataTexture(primitiveInfo, pinfoPixels, 1, THREE.RGBAFormat, THREE.FloatType, THREE.UVMapping,THREE.ClampToEdgeWrapping, THREE.ClampToEdgeWrapping, THREE.NearestFilter, THREE.NearestFilter);
        dt.flipY = false;
        dt.needsUpdate = true;

        this.fShader = this.makeFragmentShader(numPrimitives, pinfoPixels);

        this.vShader = [
            'varying vec4 vPosition;',
            'varying vec3 vNormal;',
            'void main() {',
                'vPosition = modelMatrix * vec4(position, 1.0);',
                'vNormal = normal;',
                'gl_Position = ',
                    'projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
            '}'].join('\n');


        this.uniforms = {};

        this.uniforms.lightsource = { type: 'v3', value: new THREE.Vector3(this._lightPosition[0], this._lightPosition[1], this._lightPosition[2]) };

        this.uniforms.surface = { type: 'f', value: 0.0 };

        this.uniforms.xBounds = { type: 'v2', value: new THREE.Vector2(-1, 1) };
        this.uniforms.yBounds = { type: 'v2', value: new THREE.Vector2(-1, 1) };
        this.uniforms.zBounds = { type: 'v2', value: new THREE.Vector2(-1, 1) };

        // Texture storing pointers in to the primitiveInfo texture (1 pixel = 1 ptr (1 primitive))
        this.uniforms.primitive_ptrs = {'type': 't', value: dt_ptr};
        // Texture storing info about each primitive
        this.uniforms.primitive_info = {'type': 't', value: dt};

        this.material = new THREE.ShaderMaterial({
            uniforms:       this.uniforms,
            vertexShader:   this.vShader,
            fragmentShader: this.fShader,
            side:           THREE.DoubleSide,
            shading:        THREE.SmoothShading,
        });

        this.box = new Box('plot', [10,10,10], { material: this.material });

        this.world.addEntity(this.box);

        this.world.go();

        $(window).resize(() => this.world.setSize());
    }

    makeFragmentShader(ptrsSize, piSize) {
        /* eslint indent: "off", max-len: "off" */

        const fShader = [
            'varying vec4 vPosition;',
            'uniform vec3 lightsource;',
            'uniform vec2 xBounds;',
            'uniform vec2 yBounds;',
            'uniform vec2 zBounds;',
            'uniform sampler2D primitive_ptrs;',
            'uniform sampler2D primitive_info;',

            'const int ptrsSize = ' + ptrsSize + ';',
            'const int piSize = ' + piSize + ';',

            'const float pixWidthPtrs = 1./float(ptrsSize);',
            'const float pixWidthInfo = 1./float(piSize);',

            'float intersectSphere(vec3 c, float r, vec3 ro, vec3 rd) {',
                'float A, B, C;',
                'vec3 ro_c = ro - c;',
                'C = dot(ro_c, ro_c) - r*r;',
                'B = dot(ro_c*2., rd);',
                'A = dot(rd, rd);',
                'float delta = B*B - 4.*A*C;',

                'if (delta < 0.) { return -1.; }',
                'else if (delta == 0.) {',
                    'if (-B/(2.*A) < 0.) {',
                        'return -1.;',
                    '} else {',
                        'return -B/(2.*A);',
                    '}',
                '} else {',
                    'float sqrtDelta = sqrt(delta);',
                    'float first  = (-B + sqrtDelta)/(2.*A);',
                    'float second = (-B - sqrtDelta)/(2.*A);',

                    'if (first >= 0. && second >= 0.) {',
                        'if (first <= second) {',
                            'return first;',
                        '} else {',
                            'return second;',
                        '}',
                    '} else if (first < 0. && second < 0.) {',
                        'return -1.;',
                    '} else {',
                        'if (first < 0.) { return second; }',
                        'else { return first; }',
                    '}',
                '}',

            '}',

            'float intersectTriangle(vec3 a, vec3 b, vec3 c, vec3 ro, vec3 rd) {',
                'vec3 N = cross(b - a, c - a);',
                'float t = dot(a - ro, N) / dot(rd, N);',
                'vec3 pt = ro + rd*t;',

                'if (t < 0. || dot(N, -rd) < 0.) { return -1.; }',
                'else {',
                    'vec3 v1 = cross(a - pt, b - pt);',
                    'vec3 v2 = cross(b - pt, c - pt);',
                    'vec3 v3 = cross(c - pt, a - pt);',
                    'if (dot(v1, v2) >= 0. && dot(v2,v3) >= 0. && dot(v3,v1) >= 0.) { return t; }',
                    'else { return -1.; }',
                '}',
            '}',

            'void intersect(in vec3 ro, in vec3 rd, inout int pid, inout float min_t) {',
            // intersect S
                'for (int i = 0; i < ptrsSize; i++) {',
                    'float t = -1.;',

                    'float pIdx = texture2D(primitive_ptrs, vec2((float(i)+0.5)*pixWidthPtrs, 0.5)).r;',
                    'float pInfo = texture2D(primitive_info, vec2((pIdx+0.5)*pixWidthInfo, 0.5)).r;',

                    'if (pInfo < 0.5) {',
                        'vec3 a = texture2D(primitive_info, vec2((pIdx+2.+0.5)*pixWidthInfo, 0.5)).xyz;',
                        'vec3 b = texture2D(primitive_info, vec2((pIdx+3.+0.5)*pixWidthInfo, 0.5)).xyz;',
                        'vec3 c = texture2D(primitive_info, vec2((pIdx+4.+0.5)*pixWidthInfo, 0.5)).xyz;',
                        't = intersectTriangle(a, b, c, ro, rd);',

                    '} else if (pInfo >= 0.5) {',
                        'vec4 c_and_r = texture2D(primitive_info, vec2((pIdx+2.+0.5)*pixWidthInfo, 0.5));',
                        't = intersectSphere(c_and_r.xyz, c_and_r.a, ro, rd);',
                    '}',
                    'if (t > 0.+1e-3 && t < min_t) {',
                        'pid = i;',
                        'min_t = t;',
                    '}',
                '}',
            '}',

            'void main() {',

                'vec3 ro = cameraPosition;',
                'vec3 dir = vPosition.xyz - ro;',
                'float t_entry = length(dir);',
                'vec3 rd = normalize(dir);',

                'if (t_entry < 0.) { gl_FragColor = vec4(0.,0.,0.,1.); return; }',

                'vec3 normal;',
                'vec3 color;',
                'vec3 p;',
                'int pid = -1;',
                'float min_t = 1000000.;',

                'intersect(ro, rd, pid, min_t);',

//                'if (pid == 0) {',
//                    'ro = ro + min_t*rd;',
//                    'pid = -1;',
//                    'min_t = 100000.;',
//                    'normal = normalize(ro-spherePositions[0]);',
//                    'rd = rd - 2.*normal * dot(rd, normal);',
//                    'intersect(ro, rd, pid, min_t);',
//                '}',

                'if (pid == -1) {',
                    'gl_FragColor = vec4(.8,.8,.8,1.);',
                '} else {',
                    'p = ro + min_t*rd;',

                    'float pIdx = texture2D(primitive_ptrs, vec2((float(pid)+0.5)*pixWidthPtrs, 0.5)).r;',

                    'float pInfo = texture2D(primitive_info, vec2((pIdx + 0.5)*pixWidthInfo, 0.5)).r;',

                    'if (pInfo == 0.0) {',
                        'vec3 a = texture2D(primitive_info, vec2((pIdx+2.+0.5)*pixWidthInfo, 0.5)).xyz;',
                        'vec3 b = texture2D(primitive_info, vec2((pIdx+3.+0.5)*pixWidthInfo, 0.5)).xyz;',
                        'vec3 c = texture2D(primitive_info, vec2((pIdx+4.+0.5)*pixWidthInfo, 0.5)).xyz;',
                        'normal = cross(b - a, c - a);',
                    '} else if(pInfo == 1.0) {',
                        'vec4 c_and_r = texture2D(primitive_info, vec2((pIdx+2.+0.5)*pixWidthInfo, 0.5));',
                        'normal = p - c_and_r.xyz;',
                    '}',

                    'vec3 color = texture2D(primitive_info, vec2((floor(pIdx)+1.5)*pixWidthInfo, 0.5)).rgb;',

                    'vec3 N = normalize(normal);',
                    'vec3 L = normalize(lightsource - p);',
                    'vec3 V = -rd;',

                    'if (dot(V, N) < 0.) { N = -N; }',

                    'gl_FragColor = vec4(clamp(dot(N, L),0.,1.)*color, 1.);',


                '}',

            '}'].join('\n');

        return fShader;
    }
}

export default Raytracer;
