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

  // ✅ FIX 1: resize now tracks video's real position on the page
  function resize() {
    const rect = video.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    if (!w || !h) return;

    canvasGL.style.left = rect.left + window.scrollX + "px";
    canvasGL.style.top = rect.top + window.scrollY + "px";
    canvasGL.style.width = w + "px";
    canvasGL.style.height = h + "px";

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
    wrapper.style.marginBottom = "10px";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.fontSize = "11px";
    row.style.marginBottom = "3px";

    const lbl = document.createElement("span");
    lbl.textContent = label;

    const val = document.createElement("span");
    val.style.color = "#aaa";
    val.textContent = parseFloat(state[key]).toFixed(2);

    row.appendChild(lbl);
    row.appendChild(val);

    const input = document.createElement("input");
    input.type = "range";
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = state[key];
    input.style.width = "100%";
    input.style.cursor = "pointer";
    input.style.accentColor = "#f00";

    input.oninput = () => {
      state[key] = parseFloat(input.value);
      val.textContent = parseFloat(input.value).toFixed(2);
    };

    wrapper.appendChild(row);
    wrapper.appendChild(input);
    return wrapper;
  }

  function createUI() {
    const panel = document.createElement("div");
    panel.id = "__yt_filter_panel__";
    panel.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 99999;
      background: #1a1a1a;
      color: #fff;
      padding: 14px;
      border-radius: 12px;
      font-family: monospace;
      font-size: 12px;
      width: 250px;
      max-height: 85vh;
      overflow-y: auto;
      box-shadow: 0 4px 24px rgba(0,0,0,0.7);
      border: 1px solid #333;
      user-select: none;
    `;

    // Header
    const header = document.createElement("div");
    header.style.cssText =
      "display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; cursor:grab;";

    const title = document.createElement("span");
    title.textContent = "🎨 YT Filter";
    title.style.fontWeight = "bold";

    const toggle = document.createElement("button");
    toggle.textContent = "ON";
    toggle.style.cssText = `
      background: #c00;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 3px 10px;
      cursor: pointer;
      font-family: monospace;
      font-size: 12px;
    `;
    toggle.onclick = () => {
      state.enabled = !state.enabled;
      toggle.textContent = state.enabled ? "ON" : "OFF";
      toggle.style.background = state.enabled ? "#c00" : "#444";
      canvasGL.style.display = state.enabled ? "block" : "none";
    };

    header.appendChild(title);
    header.appendChild(toggle);
    panel.appendChild(header);

    // Divider
    const hr = document.createElement("hr");
    hr.style.cssText =
      "border:none; border-top:1px solid #333; margin-bottom:12px;";
    panel.appendChild(hr);

    // Sliders
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

    // Reset button
    const resetBtn = document.createElement("button");
    resetBtn.textContent = "Reset Defaults";
    resetBtn.style.cssText = `
      width: 100%;
      margin-top: 10px;
      background: #333;
      color: #fff;
      border: none;
      border-radius: 6px;
      padding: 6px;
      cursor: pointer;
      font-family: monospace;
      font-size: 11px;
    `;
    const defaults = {
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
    resetBtn.onclick = () => {
      Object.assign(state, defaults);
      panel.querySelectorAll("input[type=range]").forEach((input) => {
        const key = input.dataset.key;
        if (key) {
          input.value = state[key];
          const valSpan =
            input.previousSibling &&
            input.previousSibling.querySelector("span:last-child");
          if (valSpan) valSpan.textContent = parseFloat(state[key]).toFixed(2);
        }
      });
    };
    panel.appendChild(resetBtn);

    // Store key on each input for reset
    panel.querySelectorAll("input[type=range]").forEach((input, i) => {
      const keys = [
        "threshold",
        "darkness",
        "softness",
        "brightness",
        "contrast",
        "saturation",
        "gamma",
        "blueReduce",
        "shadowLift",
      ];
      input.dataset.key = keys[i];
    });

    // Draggable
    let dragging = false,
      ox = 0,
      oy = 0;
    header.onmousedown = (e) => {
      dragging = true;
      ox = e.clientX - panel.getBoundingClientRect().left;
      oy = e.clientY - panel.getBoundingClientRect().top;
      header.style.cursor = "grabbing";
    };
    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      panel.style.right = "auto";
      panel.style.left = e.clientX - ox + "px";
      panel.style.top = e.clientY - oy + "px";
    });
    document.addEventListener("mouseup", () => {
      dragging = false;
      header.style.cursor = "grab";
    });

    document.body.appendChild(panel);
  }

  /* ========================= INIT ========================= */

  function inject(v) {
    video = v;

    canvas2D = document.createElement("canvas");
    ctx2D = canvas2D.getContext("2d");

    // ✅ FIX 2: append to body instead of inside the player
    // so YouTube's settings/controls are never blocked
    canvasGL = document.createElement("canvas");
    canvasGL.style.position = "absolute";
    canvasGL.style.pointerEvents = "none";
    canvasGL.style.zIndex = "2000";

    document.body.appendChild(canvasGL); // ← was: player.appendChild(canvasGL)

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
