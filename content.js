(() => {
  if (window.__YT_PRO_FILTER__) return;
  window.__YT_PRO_FILTER__ = true;

  /* ========================= STATE ========================= */

  const state = {
    enabled: true,
    threshold: 0.9,
    darkness: 0.7,
    softness: 0.12,
    brightness: 0.0,
    contrast: 1.1,
    saturation: 1.0,
    gamma: 0.95,
    blueReduce: 0.2,
    shadowLift: 0.05,
  };

  let video = null;
  let canvas2D = null;
  let ctx2D = null;
  let canvasGL = null;
  let gl = null;
  let program = null;
  let texture = null;
  let uniforms = {};
  let rafId = null;

  /* ========================= SHADERS ========================= */

  const VERT = `
    attribute vec2 a_position;
    varying vec2 v_texCoord;
    void main() {
      v_texCoord = vec2(
        a_position.x * 0.5 + 0.5,
        1.0 - (a_position.y * 0.5 + 0.5)
      );
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const FRAG = `
   precision mediump float;

uniform sampler2D u_texture;
uniform float u_contrast;
uniform float u_brightness;
uniform float u_gamma;

varying vec2 v_texCoord;

void main() {
    vec4 color = texture2D(u_texture, v_texCoord);

    // TRUE PIXEL INVERSION
    vec3 col = 1.0 - color.rgb;

    // Optional adjustments
    col += u_brightness;
    col = (col - 0.5) * u_contrast + 0.5;
    col = pow(col, vec3(u_gamma));

    gl_FragColor = vec4(col, 1.0);
}
  `;

  /* ========================= WEBGL ========================= */

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  }

  function initWebGL() {
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);

    program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);

    uniforms = {
      threshold: gl.getUniformLocation(program, "u_threshold"),
      darkness: gl.getUniformLocation(program, "u_darkness"),
      softness: gl.getUniformLocation(program, "u_softness"),
      brightness: gl.getUniformLocation(program, "u_brightness"),
      contrast: gl.getUniformLocation(program, "u_contrast"),
      saturation: gl.getUniformLocation(program, "u_saturation"),
      gamma: gl.getUniformLocation(program, "u_gamma"),
      blueReduce: gl.getUniformLocation(program, "u_blueReduce"),
      shadowLift: gl.getUniformLocation(program, "u_shadowLift"),
    };
  }

  function resize() {
    const w = video.clientWidth;
    const h = video.clientHeight;
    if (!w || !h) return;

    canvasGL.width = w;
    canvasGL.height = h;
    gl.viewport(0, 0, w, h);

    canvas2D.width = w;
    canvas2D.height = h;
  }

  function render() {
    rafId = requestAnimationFrame(render);
    if (!state.enabled || video.readyState < 2) return;

    resize();

    ctx2D.drawImage(video, 0, 0, canvas2D.width, canvas2D.height);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      canvas2D,
    );

    Object.keys(uniforms).forEach((key) => {
      gl.uniform1f(uniforms[key], state[key]);
    });

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /* ========================= UI ========================= */

  function createSlider(label, key, min, max, step) {
    const wrapper = document.createElement("div");
    wrapper.style.marginBottom = "8px";

    const lbl = document.createElement("div");
    lbl.textContent = label;
    lbl.style.fontSize = "11px";

    const input = document.createElement("input");
    input.type = "range";
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = state[key];
    input.style.width = "100%";

    input.oninput = () => {
      state[key] = parseFloat(input.value);
    };

    wrapper.appendChild(lbl);
    wrapper.appendChild(input);
    return wrapper;
  }

  function createUI() {
    const panel = document.createElement("div");
    panel.style.position = "fixed";
    panel.style.top = "80px";
    panel.style.right = "20px";
    panel.style.zIndex = "10000";
    panel.style.background = "#111";
    panel.style.color = "#fff";
    panel.style.padding = "12px";
    panel.style.borderRadius = "10px";
    panel.style.fontFamily = "monospace";
    panel.style.width = "240px";
    panel.style.maxHeight = "80vh";
    panel.style.overflowY = "auto";

    const toggle = document.createElement("button");
    toggle.textContent = "Filter ON";
    toggle.style.width = "100%";
    toggle.style.marginBottom = "10px";
    toggle.onclick = () => {
      state.enabled = !state.enabled;
      toggle.textContent = state.enabled ? "Filter ON" : "Filter OFF";
      canvasGL.style.display = state.enabled ? "block" : "none";
    };

    panel.appendChild(toggle);

    panel.appendChild(
      createSlider("White Threshold", "threshold", 0.5, 1.0, 0.01),
    );
    panel.appendChild(createSlider("Darkness", "darkness", 0.1, 1.0, 0.01));
    panel.appendChild(createSlider("Softness", "softness", 0.01, 0.3, 0.01));
    panel.appendChild(
      createSlider("Brightness", "brightness", -0.3, 0.3, 0.01),
    );
    panel.appendChild(createSlider("Contrast", "contrast", 0.5, 2.0, 0.01));
    panel.appendChild(createSlider("Saturation", "saturation", 0.0, 2.0, 0.01));
    panel.appendChild(createSlider("Gamma", "gamma", 0.6, 1.4, 0.01));
    panel.appendChild(createSlider("Blue Light", "blueReduce", 0.0, 0.7, 0.01));
    panel.appendChild(
      createSlider("Shadow Lift", "shadowLift", 0.0, 0.2, 0.01),
    );

    document.body.appendChild(panel);
  }

  /* ========================= INIT ========================= */

  function inject(v) {
    video = v;

    const player = document.querySelector(".html5-video-player");
    if (!player) return;

    player.style.position = "relative";

    canvas2D = document.createElement("canvas");
    ctx2D = canvas2D.getContext("2d");

    canvasGL = document.createElement("canvas");
    canvasGL.style.position = "absolute";
    canvasGL.style.top = "0";
    canvasGL.style.left = "0";
    canvasGL.style.width = "100%";
    canvasGL.style.height = "100%";
    canvasGL.style.pointerEvents = "none";
    canvasGL.style.zIndex = "9999";

    player.appendChild(canvasGL);

    gl = canvasGL.getContext("webgl");
    if (!gl) return;

    initWebGL();
    render();
  }

  function watch() {
    new MutationObserver(() => {
      const v = document.querySelector("video");
      if (v && v !== video) {
        if (canvasGL) canvasGL.remove();
        cancelAnimationFrame(rafId);
        inject(v);
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  function start() {
    createUI();
    const v = document.querySelector("video");
    if (v) inject(v);
    watch();
  }
  window.addEventListener("load", start);
})();
