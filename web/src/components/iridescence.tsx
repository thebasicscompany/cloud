"use client";

import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";

import "./iridescence.css";

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;

uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;

varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;

  uv += (uMouse - vec2(0.5)) * uAmplitude;

  float d = -uTime * 0.5 * uSpeed;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += uTime * 0.5 * uSpeed;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  // Collapse the per-channel pattern to a single scalar so the mix produces
  // a clean white -> uColor wash (no rainbow per-channel offsets). Powering
  // it up biases the surface toward white; only the brightest peaks tint.
  vec3 pattern = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5);
  float p = (pattern.r + pattern.g + pattern.b) / 3.0;
  p = pow(clamp(p, 0.0, 1.0), 3.5);
  col = mix(vec3(1.0), uColor, p);
  gl_FragColor = vec4(col, 1.0);
}
`;

interface IridescenceProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "color"> {
  color?: [number, number, number];
  speed?: number;
  amplitude?: number;
  mouseReact?: boolean;
}

export function Iridescence({
  color = [1, 1, 1],
  speed = 1.0,
  amplitude = 0.1,
  mouseReact = true,
  className,
  ...rest
}: IridescenceProps) {
  const ctnDom = useRef<HTMLDivElement | null>(null);
  const mousePos = useRef({ x: 0.5, y: 0.5 });
  // Keep refs to the live program + listener so prop-change effects can
  // write uniforms without re-initializing WebGL on every parent render.
  // The mount effect used to re-run any time `color` changed - and since
  // the consumer passes a fresh array literal each render, every keystroke
  // tore down and rebuilt the canvas. The brief gl.clearColor(white) at
  // the top of the init path is the white-flash bug the user reported.
  const programRef = useRef<Program | null>(null);
  const mouseHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);

  // Mount-only effect: build renderer, program, geometry, canvas + render
  // loop. NEVER re-run on prop changes - those are handled below.
  useEffect(() => {
    if (!ctnDom.current) return;
    const ctn = ctnDom.current;
    const renderer = new Renderer();
    const gl = renderer.gl;
    gl.clearColor(1, 1, 1, 1);

    function resize() {
      const scale = 1;
      renderer.setSize(ctn.offsetWidth * scale, ctn.offsetHeight * scale);
      const prog = programRef.current;
      if (prog) {
        prog.uniforms.uResolution.value = new Color(
          gl.canvas.width,
          gl.canvas.height,
          gl.canvas.width / gl.canvas.height,
        );
      }
    }
    window.addEventListener("resize", resize, false);
    resize();

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(...color) },
        uResolution: {
          value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height),
        },
        uMouse: { value: new Float32Array([mousePos.current.x, mousePos.current.y]) },
        uAmplitude: { value: amplitude },
        uSpeed: { value: speed },
      },
    });
    programRef.current = program;

    const mesh = new Mesh(gl, { geometry, program });
    let animateId = 0;

    function update(t: number) {
      animateId = requestAnimationFrame(update);
      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
    }
    animateId = requestAnimationFrame(update);
    ctn.appendChild(gl.canvas);

    return () => {
      cancelAnimationFrame(animateId);
      window.removeEventListener("resize", resize);
      const handler = mouseHandlerRef.current;
      if (handler) ctn.removeEventListener("mousemove", handler);
      mouseHandlerRef.current = null;
      programRef.current = null;
      if (gl.canvas.parentElement === ctn) {
        ctn.removeChild(gl.canvas);
      }
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
    // Mount-only. Subsequent prop changes flow through the uniform-update
    // effect below; never tear down the canvas on a parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push prop changes straight into the live uniforms. Color is depth-
  // compared by serializing its tuple so a fresh-array-literal parent
  // re-render doesn't keep re-rebuilding the Color object pointlessly.
  const [r, g, b] = color;
  useEffect(() => {
    const prog = programRef.current;
    if (!prog) return;
    prog.uniforms.uColor.value = new Color(r, g, b);
    prog.uniforms.uAmplitude.value = amplitude;
    prog.uniforms.uSpeed.value = speed;
  }, [r, g, b, amplitude, speed]);

  // Mouse listener as its own effect so toggling mouseReact doesn't
  // rebuild the canvas either.
  useEffect(() => {
    const ctn = ctnDom.current;
    if (!ctn) return;
    if (!mouseReact) return;
    const handler = (e: MouseEvent) => {
      const rect = ctn.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1.0 - (e.clientY - rect.top) / rect.height;
      mousePos.current = { x, y };
      const prog = programRef.current;
      if (prog) {
        prog.uniforms.uMouse.value[0] = x;
        prog.uniforms.uMouse.value[1] = y;
      }
    };
    mouseHandlerRef.current = handler;
    ctn.addEventListener("mousemove", handler);
    return () => {
      ctn.removeEventListener("mousemove", handler);
      mouseHandlerRef.current = null;
    };
  }, [mouseReact]);

  return <div ref={ctnDom} className={`iridescence-container ${className ?? ""}`} {...rest} />;
}

export default Iridescence;
