import Box from '../entity/box'
import Cylinder from '../entity/cylinder'
import Sphere from '../entity/sphere'
import Capsule from '../entity/capsule'
import Plane from '../entity/plane'

function World(name, opts) {

    this.name = name;
    this.opts = (opts === undefined) ? {} : opts;
    this.initializeGL();
    this.initialize();
    this.initializeDiv();
    this.paused = true;

    this.entities = {};

    this.renderReady = true;
}


World.prototype.constructor = World;

World.prototype.initializeGL = function() {
    try{
        this.renderer = new THREE.WebGLRenderer({
            preserveDrawingBuffer: true,
            premultipliedAlpha: false,
            antialias: true,
        });
        this.renderType = 'webgl';
    }catch(e){
        try{
            this.renderer = new THREE.CanvasRenderer();
            this.renderType = 'canvas';
        }catch(e2){
            this.error = true;
            return;
        }
    }
    this.error = false;

    if (!this.renderer.getContext().getExtension('OES_texture_float')) {
        console.warn('BROWSER DOES NOT SUPPORT OES FLOAT TEXTURES');
    }

    this.renderer.setClearColor(0xffffff, 1);
}

World.prototype.initialize = function() {

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 400/400, 1, 1000);
    this.scene.add(this.camera);
    this.light = new THREE.PointLight( 0xfffffa, 1, 0 );
    this.light.position.set( 1, 20, -20 );
    this.scene.add( this.light );

    /*
    this.camera.position.x = -0;
    this.camera.position.y = -5;
    */
    this.camera.position.z = 20;

    $(document).ready(function() {
//        controls = new THREE.TrackballControls( this.camera, this.renderer.domElement);
        var controls = new THREE.TrackballControls( this.camera, (this.opts.element === undefined) ? $('body') : $(this.opts.element)[0]);

        controls.rotateSpeed = 20.0;
        controls.zoomSpeed = 1.2;

        controls.noZoom = false;

        controls.staticMoving = true;
        controls.dynamicDampingFactor = 0.3;

        this.controls = controls;
    }.bind(this));
};

World.prototype.initializeDiv = function() {

    this.panel = $('<div>')
        .addClass('ThreePanel')
        .attr({tabindex:0});

    this.renderer.setSize(400,400);

    this.canvas = $(this.renderer.domElement).width(400).height(400).addClass("threeCanvas");
    $(this.panel).append(this.canvas);

};

World.prototype.setSize = function() {

    var w = $(this.opts.element).width();
    var h = $(this.opts.element).height();

    this.canvas.width(w);
    this.canvas.height(h);

    this.renderer.setSize(w, h);

    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();

//    this.panel.css({width: w, height: h});
};

World.prototype.addEntity = function(e) {

    var name = e.name;
    if (name in this.entities) {
        console.error('Cannot add entity. Entity with name ' + name + 'already exists.');
        return -1;
    }

    this.entities[name] = e;

    this.scene.add(e.mesh);

}

World.prototype.removeEntity = function(e) {
    if (this.entities[e.name] === undefined) {
        return;
    }
    this.scene.remove(e.mesh);
    delete this.entities[e.name];
}

World.prototype.setFromJSON = function(data) {
    var entities = data.entities;
    for (var e in entities) {
        var ent = this.entities[e];
        if (ent !== undefined) {
            ent.setMfromQandP(entities[e].rot, entities[e].pos);
            /*
            ent.setPosition(entities[e].pos);
            ent.setRotation(entities[e].rot);
            */
        } else {
            console.error('attempting to set unknown entity with name ' + e);
        }
    }
}

World.prototype.populateFromJSON = function(data) {

    var entities = data.entities;
    for (var e in entities) {

        var name = e;
        var type = entities[e].type;
        var toAdd;
        switch (type) {
            case 'box':
                toAdd = new Box(name, entities[e].sides,{default_rotation: [.7071,.7071,0,0]});
                break;
            case 'sphere':
                toAdd = new Sphere(name, entities[e].radius,{default_rotation: [.7071,.7071,0,0]});
                break;
            case 'cylinder':
                toAdd = new Cylinder(name, entities[e].radius, entities[e].height,{default_rotation: [.7071,.7071,0,0]});
                break;
            case 'capsule':
                toAdd = new Capsule(name, entities[e].radius, entities[e].height,{default_rotation: [.7071,.7071,0,0]});
                break;
            case 'plane':
                toAdd = new Plane(name, entities[e].A, entities[e].B,{default_rotation: [.7071,.7071,0,0]});
                break;
            default:
                toAdd = null;
                console.error('Unknown Entity: ' + name + ' with type: ' + type);
                break;
        }

        if (toAdd != null) {
            toAdd.setMfromQandP(entities[e].rot, entities[e].pos);
            /*
            toAdd.setPosition(entities[e].pos);
            toAdd.setRotation(entities[e].rot);
            */
            this.addEntity(toAdd);
        }

    }

    return;
}

World.prototype.go = function() {

    this.paused = false;

    var renderLoop = function() {
        this.renderer.render(this.scene, this.camera);
        if (this.controls !== undefined) {
            this.controls.update();
        }
        if (!(this.paused)) { setTimeout(renderLoop, 1000/30); }
    }.bind(this)

    renderLoop();
}

export default World;
