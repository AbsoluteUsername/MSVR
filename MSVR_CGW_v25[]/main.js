'use strict';

let gl;                         // The webgl context.
let surface;                    // A surface model
let shProgram;                  // A shader program
let spaceball;                  // A SimpleRotator object that lets the user rotate the view by mouse.
let sphere;
let userPointCoord;
let userScaleFactor;

let plane;
let texture;
let texture2;
let video, track;
let camera;

function deg2rad(angle) {
  return angle * Math.PI / 180;
}

function StereoCamera(
  Convergence,
  EyeSeparation,
  AspectRatio,
  FOV,
  NearClippingDistance,
  FarClippingDistance
) {
  this.mConvergence = Convergence;
  this.mEyeSeparation = EyeSeparation;
  this.mAspectRatio = AspectRatio;
  this.mFOV = FOV;
  this.mNearClippingDistance = NearClippingDistance;
  this.mFarClippingDistance = FarClippingDistance;

  this.mProjectionMatrix = null;
  this.mModelViewMatrix = null;

  this.ApplyLeftFrustum = function() {
    let top, bottom, left, right;
    top = this.mNearClippingDistance * Math.tan(this.mFOV / 2);
    bottom = -top;

    let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
    let b = a - this.mEyeSeparation / 2;
    let c = a + this.mEyeSeparation / 2;

    left = (-b * this.mNearClippingDistance) / this.mConvergence;
    right = (c * this.mNearClippingDistance) / this.mConvergence;

    // Set the Projection Matrix
    this.mProjectionMatrix = m4.frustum(
      left,
      right,
      bottom,
      top,
      this.mNearClippingDistance,
      this.mFarClippingDistance
    );

    // Displace the world to right
    this.mModelViewMatrix = m4.translation(
      this.mEyeSeparation / 2,
      0.0,
      0.0
    );
  };

  this.ApplyRightFrustum = function() {
    let top, bottom, left, right;
    top = this.mNearClippingDistance * Math.tan(this.mFOV / 2);
    bottom = -top;

    let a = this.mAspectRatio * Math.tan(this.mFOV / 2) * this.mConvergence;
    let b = a - this.mEyeSeparation / 2;
    let c = a + this.mEyeSeparation / 2;

    left = (-c * this.mNearClippingDistance) / this.mConvergence;
    right = (b * this.mNearClippingDistance) / this.mConvergence;

    // Set the Projection Matrix
    this.mProjectionMatrix = m4.frustum(
      left,
      right,
      bottom,
      top,
      this.mNearClippingDistance,
      this.mFarClippingDistance
    );

    // Displace the world to left
    this.mModelViewMatrix = m4.translation(
      -this.mEyeSeparation / 2,
      0.0,
      0.0
    );
  };

  this.updateValues = function() {
    let inputs = document.getElementsByClassName("inputsClass");
    let spans = document.getElementsByClassName("spansClass");
    let eyeSep = 70.0;
    eyeSep = inputs[0].value;
    spans[0].innerHTML = eyeSep;
    this.mEyeSeparation = eyeSep;
    let fov = 0.8;
    fov = inputs[1].value;
    spans[1].innerHTML = fov;
    this.mFOV = fov;
    let nearClip = 5.0;
    nearClip = inputs[2].value - 0.0;
    spans[2].innerHTML = nearClip;
    this.mNearClippingDistance = nearClip
    let convergence = 2000.0;
    convergence = inputs[3].value;
    spans[3].innerHTML = convergence;
    this.mConvergence = convergence
  }
}



// Constructor
function Model(name) {
  this.name = name;
  this.iVertexBuffer = gl.createBuffer();
  this.iTextureBuffer = gl.createBuffer();
  this.countT = 0;
  this.count = 0;

  this.BufferData = function(vertices) {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STREAM_DRAW);

    this.count = vertices.length / 3;
  }

  this.TextureBufferData = function(points) {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STREAM_DRAW);

    this.countT = points.length / 2;
  }

  this.Draw = function() {

    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iTextureBuffer);
    gl.vertexAttribPointer(shProgram.iAttribTexture, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribTexture);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, this.count);
  }

  this.DrawPoint = function() {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.iVertexBuffer);
    gl.vertexAttribPointer(shProgram.iAttribVertex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(shProgram.iAttribVertex);
    gl.drawArrays(gl.LINE_STRIP, 0, this.count);
  }
}


// Constructor
function ShaderProgram(name, program) {

  this.name = name;
  this.prog = program;

  // Location of the attribute variable in the shader program.
  this.iAttribVertex = -1;
  this.iAttribTexture = -1;
  // Location of the uniform matrix representing the combined transformation.
  this.iModelViewProjectionMatrix = -1;

  this.iTMU = -1;

  this.iUserPoint = -1;
  this.iScale = 1.0;
  this.iUP = -1;

  this.Use = function() {
    gl.useProgram(this.prog);
  }
}


/* Draws a colored cube, along with a set of coordinate axes.
 * (Note that the use of the above drawPrimitive function is not an efficient
 * way to draw with WebGL.  Here, the geometry is so simple that it doesn't matter.)
 */
function draw() {
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  /* Set the values of the projection transformation */
  // let projection = m4.perspective(Math.PI / 8, 1, 8, 12);
  let para = 3
  let projection = m4.orthographic(-para, para, -para, para, 0, para * 4);

  /* Get the view matrix from the SimpleRotator object.*/
  let modelView = spaceball.getViewMatrix();

  let rotateToPointZero = m4.axisRotation([0.707, 0.707, 0], 0.0);
  let rotateWithSensor = m4.multiply(m4.axisRotation([1, 0, 0], -0.5 * Math.PI * readings.y * 0.1), m4.axisRotation([0, 1, 0], -0.5 * Math.PI * readings.x * 0.1))
  let translateToPointZero = m4.translation(0, 0, -10);

  let matAccum0 = m4.multiply(rotateToPointZero, m4.identity());
  let matAccum01 = m4.multiply(rotateToPointZero, modelView);
  let matAccum1 = m4.multiply(translateToPointZero, matAccum01);

  gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, m4.multiply(m4.scaling(4, 4, 1), m4.multiply(m4.translation(-0.5, -0.5, -10), matAccum0)));
  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, projection);

  gl.uniform1i(shProgram.iTMU, 0);
  gl.enable(gl.TEXTURE_2D);
  gl.bindTexture(gl.TEXTURE_2D, texture2);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    video
  );
  plane.Draw();
  gl.uniform1f(shProgram.iScale, userScaleFactor)
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.colorMask(false, true, true, false);
  camera.updateValues();
  camera.ApplyLeftFrustum()
  gl.uniformMatrix4fv(shProgram.iModelViewMatrix, false, m4.multiply(matAccum1, rotateWithSensor));
  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, camera.mProjectionMatrix);
  surface.Draw();
  gl.colorMask(true, false, false, false);
  gl.clear(gl.DEPTH_BUFFER_BIT);
  camera.ApplyRightFrustum()
  gl.uniformMatrix4fv(shProgram.iProjectionMatrix, false, camera.mProjectionMatrix);
  surface.Draw();
  gl.colorMask(true, true, true, true);
  // gl.uniform1f(shProgram.iScale, -1.0)
  // let a = 2 - 1;
  // let c = -2 * Math.PI * a / Math.tan(-0.5);
  // let b = 3 * c / 4;
  // let trS = conjugation(map(userPointCoord.x, 0, 1, 0, b), map(userPointCoord.y, 0, 1, 0, Math.PI * 2), a, c)
  // gl.uniform3fv(shProgram.iUP, [trS.x, trS.y, trS.z]);
  // sphere.DrawPoint();

}

function _draw() {
  draw()
  window.requestAnimationFrame(_draw)
}

function dot(a, b) {
  let c = [(a[1] * b[2] - a[2] * b[1]), (a[0] * b[2] - b[0] * a[2]), (a[0] * b[1] - a[1] * b[0])]
  return c
}
function normalize(a) {
  let d = Math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2)
  let n = [a[0] / d, a[1] / d, a[2] / d]
  return n;
}

function CreateSurfaceData() {
  let vertexList = [];
  let i = 0;
  let j = 0;
  let a = 2 - 1
  let c = -2 * Math.PI * a / Math.tan(-0.5);
  let b = 3 * c / 4
  while (i < b) {
    while (j < Math.PI * 2) {
      let v1 = conjugation(i, j, a, c)
      let v2 = conjugation(i + 0.2, j, a, c)
      let v3 = conjugation(i, j + 0.2, a, c)
      let v4 = conjugation(i + 0.2, j + 0.2, a, c)
      vertexList.push(v1.x, v1.y, v1.z);
      vertexList.push(v2.x, v2.y, v2.z);
      vertexList.push(v3.x, v3.y, v3.z);
      vertexList.push(v2.x, v2.y, v2.z);
      vertexList.push(v4.x, v4.y, v4.z);
      vertexList.push(v3.x, v3.y, v3.z);
      j += 0.2
    }
    j = 0;
    i += 0.2
  }
  return vertexList;
}
function CreateTextureData() {
  let texCoordList = [];
  let i = 0;
  let j = 0;
  let a = 2 - 1
  let c = -2 * Math.PI * a / Math.tan(-0.5);
  let b = 3 * c / 4
  while (i < b) {
    while (j < Math.PI * 2) {
      let u = map(i, 0, b, 0, 1);
      let v = map(j, 0, Math.PI * 2, 0, 1);
      texCoordList.push(u, v);
      u = map(i + 0.2, 0, b, 0, 1);
      texCoordList.push(u, v);
      u = map(i, 0, b, 0, 1);
      v = map(j + 0.2, 0, Math.PI * 2, 0, 1);
      texCoordList.push(u, v);
      u = map(i + 0.2, 0, b, 0, 1);
      v = map(j, 0, Math.PI * 2, 0, 1);
      texCoordList.push(u, v);
      u = map(i + 0.2, 0, b, 0, 1);
      v = map(j + 0.2, 0, Math.PI * 2, 0, 1);
      texCoordList.push(u, v);
      u = map(i, 0, b, 0, 1);
      v = map(j + 0.2, 0, Math.PI * 2, 0, 1);
      texCoordList.push(u, v);
      j += 0.2;
    }
    j = 0
    i += 0.2;
  }
  return texCoordList;
}

function CreateSphereSurface(r = 0.05) {
  let vertexList = [];
  let lon = -Math.PI;
  let lat = -Math.PI * 0.5;
  while (lon < Math.PI) {
    while (lat < Math.PI * 0.5) {
      let v1 = sphereSurfaceData(r, lon, lat);
      vertexList.push(v1.x, v1.y, v1.z);
      lat += 0.05;
    }
    lat = -Math.PI * 0.5
    lon += 0.05;
  }
  return vertexList;
}

function sphereSurfaceData(r, u, v) {
  let x = r * Math.sin(u) * Math.cos(v);
  let y = r * Math.sin(u) * Math.sin(v);
  let z = r * Math.cos(u);
  return { x: x, y: y, z: z };
}


function conjugation(z, b, a, c) {

  let r = a * (1 - Math.cos(Math.PI * 2 * z / c)) + 1;
  let t = 0.25 * Math.PI;
  let x = 0.2 * r * Math.cos(b);
  let y = 0.2 * r * Math.sin(b)
  let z1 = 0.2 * z
  return { x: x, y: y, z: z1 }
}

function map(val, f1, t1, f2, t2) {
  let m;
  m = (val - f1) * (t2 - f2) / (t1 - f1) + f2
  return Math.min(Math.max(m, f2), t2);
}

function vec3Cross(a, b) {
  let x = a.y * b.z - b.y * a.z;
  let y = a.z * b.x - b.z * a.x;
  let z = a.x * b.y - b.x * a.y;
  return { x: x, y: y, z: z }
}

function vec3Normalize(a) {
  var mag = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
  a[0] /= mag; a[1] /= mag; a[2] /= mag;
}

/* Initialize the WebGL context. Called from init() */
function initGL() {
  let prog = createProgram(gl, vertexShaderSource, fragmentShaderSource);

  shProgram = new ShaderProgram('Basic', prog);
  shProgram.Use();

  shProgram.iAttribVertex = gl.getAttribLocation(prog, "vertex");
  shProgram.iAttribTexture = gl.getAttribLocation(prog, "texture");
  shProgram.iModelViewMatrix = gl.getUniformLocation(prog, "ModelViewMatrix");
  shProgram.iProjectionMatrix = gl.getUniformLocation(prog, "ProjectionMatrix");
  shProgram.iTMU = gl.getUniformLocation(prog, 'tmu');
  shProgram.iUserPoint = gl.getUniformLocation(prog, 'userPoint');
  shProgram.iScale = gl.getUniformLocation(prog, 'scl');
  shProgram.iUP = gl.getUniformLocation(prog, 'translateUP');

  surface = new Model('Surface');
  surface.BufferData(CreateSurfaceData());
  LoadTexture();
  surface.TextureBufferData(CreateTextureData());
  sphere = new Model('Sphere');
  sphere.BufferData(CreateSphereSurface(0.05))
  plane = new Model('Plane')
  plane.BufferData([0, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0]);
  plane.TextureBufferData([1, 1, 0, 1, 0, 0, 0, 0, 1, 0, 1, 1]);

  gl.enable(gl.DEPTH_TEST);
}


/* Creates a program for use in the WebGL context gl, and returns the
 * identifier for that program.  If an error occurs while compiling or
 * linking the program, an exception of type Error is thrown.  The error
 * string contains the compilation or linking error.  If no error occurs,
 * the program identifier is the return value of the function.
 * The second and third parameters are strings that contain the
 * source code for the vertex shader and for the fragment shader.
 */
function createProgram(gl, vShader, fShader) {
  let vsh = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(vsh, vShader);
  gl.compileShader(vsh);
  if (!gl.getShaderParameter(vsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in vertex shader:  " + gl.getShaderInfoLog(vsh));
  }
  let fsh = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(fsh, fShader);
  gl.compileShader(fsh);
  if (!gl.getShaderParameter(fsh, gl.COMPILE_STATUS)) {
    throw new Error("Error in fragment shader:  " + gl.getShaderInfoLog(fsh));
  }
  let prog = gl.createProgram();
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Link error in program:  " + gl.getProgramInfoLog(prog));
  }
  return prog;
}


/**
 * initialization function that will be called when the page has loaded
 */
function init() {
  readAccelerometer()
  camera = new StereoCamera(
    2000,
    70.0,
    1,
    0.8,
    5,
    100
  );
  userPointCoord = { x: 0.5, y: 0.5 }
  userScaleFactor = 1.0;
  let canvas;
  try {
    let resolution = Math.min(window.innerHeight, window.innerWidth);
    canvas = document.querySelector('canvas');
    gl = canvas.getContext("webgl");
    canvas.width = resolution;
    canvas.height = resolution;
    gl.viewport(0, 0, resolution, resolution);
    video = document.createElement('video');
    video.setAttribute('autoplay', true);
    window.vid = video;
    getWebcam();
    texture2 = CreateWebCamTexture();
    if (!gl) {
      throw "Browser does not support WebGL";
    }
  }
  catch (e) {
    document.querySelector('"canvas-holder"').innerHTML =
      "<p>Sorry, could not get a WebGL graphics context.</p>";
    return;
  }
  try {
    initGL();  // initialize the WebGL graphics context
  }
  catch (e) {
    document.getElementById("canvas-holder").innerHTML =
      "<p>Sorry, could not initialize the WebGL graphics context: " + e + "</p>";
    return;
  }

  spaceball = new TrackballRotator(canvas, draw, 0);

  _draw()
}

function getWebcam() {
  navigator.getUserMedia({ video: true, audio: false }, function(stream) {
    video.srcObject = stream;
    track = stream.getTracks()[0];
  }, function(e) {
    console.error('Rejected!', e);
  });
}

function CreateWebCamTexture() {
  let textureID = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, textureID);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return textureID;
}

function mat4Transpose(a, transposed) {
  var t = 0;
  for (var i = 0; i < 4; ++i) {
    for (var j = 0; j < 4; ++j) {
      transposed[t++] = a[j * 4 + i];
    }
  }
}

function mat4Invert(m, inverse) {
  var inv = new Float32Array(16);
  inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] +
    m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] -
    m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] +
    m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] -
    m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] -
    m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] +
    m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] -
    m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] +
    m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] +
    m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] -
    m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] +
    m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] -
    m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] -
    m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] +
    m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] -
    m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] +
    m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];

  var det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (det == 0) return false;
  det = 1.0 / det;
  for (var i = 0; i < 16; i++) inverse[i] = inv[i] * det;
  return true;
}

function LoadTexture() {
  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 512, 512, 0, );

  const image = new Image();
  image.crossOrigin = 'anonymus';
  image.src = "https://raw.githubusercontent.com/AbsoluteUsername/Textures/main/Polished_metal_texture.jpg";
  image.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      image
    );
    draw()
  }
}
let sensor;
let readings = {
  x: 0,
  y: 0,
  z: 0
}
function readAccelerometer() {
  sensor = new Accelerometer({ frequency: 60 });
  sensor.addEventListener("reading", () => {
    readings.x = sensor.x
    readings.y = sensor.y
    readings.z = sensor.z
  });
  sensor.start();
}