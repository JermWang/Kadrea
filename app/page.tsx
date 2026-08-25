'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/** Kadrea's streaming homes. The embeds live inside the MUSIC screen. */
const PLATFORMS = {
  spotify: {
    label: 'SPOTIFY',
    href: 'https://open.spotify.com/artist/4d3pIB1vKTMYlfsHR7RrYx',
    embed:
      'https://open.spotify.com/embed/artist/4d3pIB1vKTMYlfsHR7RrYx?utm_source=generator&theme=0',
  },
  apple: {
    label: 'APPLE',
    href: 'https://music.apple.com/us/artist/kadrea/1655290325',
    embed: 'https://embed.music.apple.com/us/artist/kadrea/1655290325',
  },
} as const;

type PlatformKey = keyof typeof PLATFORMS;

/** Kadrea's own masters, served from the site — the only audio the floor hears. */
const TRACKS = [
  { title: 'ATTITUDE', file: '/audio/attitude.mp3', rating: 4, tint: '#ff3cac' },
  {
    title: 'COMPETATIVE',
    file: '/audio/competative.mp3',
    rating: 3,
    tint: '#a958ff',
  },
  { title: 'MOROCCO', file: '/audio/morocco.mp3', rating: 5, tint: '#5cfaff' },
] as const;

const MODEL_URL = '/models/kadrea-meshy-web.glb';
const FLOOR_URL = '/models/dancefloor.glb';
const BALL_URL = '/models/discoball.glb';

const STAGE_TOP = -1.63;
const AVATAR_HEIGHT = 3.55;
const AVATAR_TOP = STAGE_TOP + AVATAR_HEIGHT;
const FRAME_PADDING = 0.55;
const FRAME_WIDTH = 2.4;
const FRAME_LIFT = 1.25;
const FLOOR_WIDTH = 9.5;
const RIM_RADIUS = 1.5;
const BALL_WIDTH = 1.4;
const BALL_HANG = 2.25;
const BALL_DEPTH = -2.2;
const BALL_OFFSET_X = -2.3;

/** The borrowed floor ships a rainbow; retint it into Kadrea's palette. */
const FLOOR_TINTS: Record<string, number> = {
  Red: 0xff3cac,
  Yellow: 0xff5cc0,
  Green: 0x5cfaff,
  Blue: 0x4bd8ff,
  Cyan: 0x5cfaff,
  Purple: 0xa958ff,
  'pattern-cyan': 0x5cfaff,
  'pattern-purple': 0xa958ff,
  'Blue-img': 0x4bd8ff,
  'wall-emit': 0xa958ff,
  base: 0x171020,
};

/** Log-spaced FFT bin edges for the 16-bar spectrum. */
const SPECTRUM_BINS = [
  1, 2, 3, 4, 6, 8, 11, 14, 19, 25, 33, 44, 58, 77, 102, 135, 180,
];

const ARROWS = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight'] as const;
const ARROW_GLYPHS = ['◀', '▼', '▲', '▶'];
const JUDGE = ['PERFECT', 'PERFECT', 'MARVELOUS', 'PERFECT', 'GREAT', 'PERFECT'];
const SCREENS = ['floor', 'music', 'merch'] as const;
type Screen = (typeof SCREENS)[number];
const TITLES: Record<Screen, string> = {
  floor: '',
  music: 'SELECT MUSIC',
  merch: 'GOODS SHOP',
};

const DEFAULT_BPM = 124;
/** PS1 crunch: render below CSS resolution and let the canvas upscale hard. */
const PIXELATION = 0.8;

/** Lane x-offsets and the step pattern that scrolls up the field. */
const LANE_X = [7, 61, 115, 169];
const STEPS = [
  { lane: 0, glyph: '◀', delay: 0, accent: false },
  { lane: 2, glyph: '▲', delay: -0.125, accent: false },
  { lane: 3, glyph: '▶', delay: -0.25, accent: false },
  { lane: 1, glyph: '▼', delay: -0.375, accent: false },
  { lane: 3, glyph: '▶', delay: -0.4375, accent: true },
  { lane: 0, glyph: '◀', delay: -0.5, accent: false },
  { lane: 1, glyph: '▼', delay: -0.625, accent: false },
  { lane: 2, glyph: '▲', delay: -0.75, accent: false },
  { lane: 3, glyph: '▶', delay: -0.875, accent: false },
  { lane: 1, glyph: '▼', delay: -0.9375, accent: true },
];

const MERCH = [
  { name: 'DANCE FLOOR TEE', slot: 'DROP SHIRT SHOT' },
  { name: 'ALL NIGHT HOODIE', slot: 'DROP HOODIE SHOT' },
  { name: 'PLAYER 1 CAP', slot: 'DROP THIRD ITEM' },
];

/** Everything the render loop mutates per frame, kept out of React state. */
type Engine = {
  audio: HTMLAudioElement | null;
  ctx: AudioContext | null;
  analyser: AnalyserNode | null;
  freq: Uint8Array<ArrayBuffer> | null;
  energy: number;
  punch: number;
  bassHist: number[];
  intervals: number[];
  detectedBpm: number;
  lastOnset: number;
  prevOnset: number;
  beatEpoch: number;
  lastBeat: number;
  combo: number;
  held: Set<string>;
  retime: ((beatSec: number) => void) | null;
};

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const comboRef = useRef<HTMLSpanElement>(null);
  const judgeRef = useRef<HTMLParagraphElement>(null);
  const bpmRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef<HTMLButtonElement>(null);
  const barRefs = useRef<(HTMLElement | null)[]>([]);

  const engineRef = useRef<Engine>({
    audio: null,
    ctx: null,
    analyser: null,
    freq: null,
    energy: 0,
    punch: 0,
    bassHist: [],
    intervals: [],
    detectedBpm: 0,
    lastOnset: 0,
    prevOnset: 0,
    beatEpoch: 0,
    lastBeat: -1,
    combo: 0,
    held: new Set(),
    retime: null,
  });

  const [screen, setScreen] = useState<Screen>('floor');
  const [platform, setPlatform] = useState<PlatformKey>('spotify');
  const [track, setTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [heldKeys, setHeldKeys] = useState<string[]>([]);

  const activePlatform = PLATFORMS[platform];

  // Mirrored into refs so the key handler and the render loop can read the
  // latest values without being torn down and rebuilt on every change.
  const screenRef = useRef<Screen>(screen);
  const trackRef = useRef(track);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    trackRef.current = track;
  }, [track]);

  /** Push the live tempo into the CSS variables every animation is timed by. */
  const setBeatVars = useCallback(() => {
    const engine = engineRef.current;
    const beat = 60 / (engine.detectedBpm || DEFAULT_BPM);
    const root = canvasRef.current?.parentElement;
    if (!root) return;
    root.style.setProperty('--beat', `${beat.toFixed(5)}s`);
    root.style.setProperty('--half', `${(beat / 2).toFixed(5)}s`);
    root.style.setProperty('--bar', `${(beat * 4).toFixed(5)}s`);
    root.style.setProperty('--loop', `${(beat * 8).toFixed(5)}s`);
    root.style.setProperty('--phrase', `${(beat * 32).toFixed(5)}s`);
    if (bpmRef.current) {
      bpmRef.current.textContent = `${engine.detectedBpm || DEFAULT_BPM} BPM`;
    }
  }, []);

  /** Re-align every CSS beat animation to now — the manual sync tap. */
  const resync = useCallback(() => {
    const root = canvasRef.current?.parentElement;
    const engine = engineRef.current;
    engine.beatEpoch = performance.now();
    engine.lastBeat = -1;
    if (!root?.getAnimations) return;
    const now = document.timeline.currentTime;
    if (now == null) return;
    for (const animation of root.getAnimations({ subtree: true })) {
      try {
        animation.startTime = now;
      } catch {
        /* not resettable */
      }
    }
  }, []);

  /** Build the audio graph on the first gesture — autoplay policy allows it there. */
  const ensureAudio = useCallback(() => {
    const engine = engineRef.current;
    if (!engine.audio) {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.addEventListener('ended', () => {
        setTrack((current) => {
          const next = (current + 1) % TRACKS.length;
          audio.src = TRACKS[next].file;
          void audio.play().catch(() => setPlaying(false));
          return next;
        });
      });
      engine.audio = audio;
    }
    if (!engine.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      ctx.createMediaElementSource(engine.audio).connect(analyser);
      analyser.connect(ctx.destination);
      engine.ctx = ctx;
      engine.analyser = analyser;
      engine.freq = new Uint8Array(analyser.frequencyBinCount);
    }
  }, []);

  const play = useCallback(
    (index: number) => {
      ensureAudio();
      const engine = engineRef.current;
      const audio = engine.audio;
      if (!audio) return;
      if (index !== trackRef.current || !audio.src) {
        audio.src = TRACKS[index].file;
        engine.intervals = [];
        engine.bassHist = [];
        engine.prevOnset = 0;
      }
      if (engine.ctx?.state === 'suspended') void engine.ctx.resume();
      void audio.play().catch(() => setPlaying(false));
      setTrack(index);
      setPlaying(true);
      setStarted(true);
    },
    [ensureAudio],
  );

  const togglePlay = useCallback(() => {
    const engine = engineRef.current;
    const audio = engine.audio;
    if (!audio || !audio.src) {
      play(trackRef.current);
      return;
    }
    if (audio.paused) {
      if (engine.ctx?.state === 'suspended') void engine.ctx.resume();
      void audio.play().catch(() => setPlaying(false));
      setPlaying(true);
      setStarted(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }, [play]);

  const seek = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    const audio = engineRef.current.audio;
    const rail = seekRef.current;
    if (!audio?.duration || !rail) return;
    const rect = rail.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
  }, []);

  const toggleHud = useCallback(() => {
    const hud = hudRef.current;
    if (!hud) return;
    const hidden = hud.style.opacity === '0';
    hud.style.opacity = hidden ? '1' : '0';
    hud.style.pointerEvents = hidden ? '' : 'none';
  }, []);

  // Keyboard: the cabinet's whole control panel.
  useEffect(() => {
    const engine = engineRef.current;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) return;
      if ((ARROWS as readonly string[]).includes(event.key)) {
        if (screenRef.current !== 'floor') return;
        event.preventDefault();
        if (!engine.held.has(event.key)) {
          engine.held.add(event.key);
          setHeldKeys([...engine.held]);
        }
        return;
      }
      if (event.key === ' ') {
        event.preventDefault();
        togglePlay();
        return;
      }
      if (event.key === 'r' || event.key === 'R') {
        resync();
        return;
      }
      if (event.key === 'Escape') {
        setScreen('floor');
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        toggleHud();
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (digit >= 1 && digit <= 3) setScreen(SCREENS[digit - 1]);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!(ARROWS as readonly string[]).includes(event.key)) return;
      engine.held.delete(event.key);
      setHeldKeys([...engine.held]);
    };

    const onBlur = () => {
      engine.held.clear();
      setHeldKeys([]);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [togglePlay, resync, toggleHud]);

  // The floor itself: scene, beat clock, and the audio it listens to.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = engineRef.current;

    const setStatus = (text: string, error?: boolean) => {
      const el = statusRef.current;
      if (!el) return;
      el.textContent = text;
      el.classList.toggle('is-error', Boolean(error));
    };

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: false,
        powerPreference: 'high-performance',
      });
    } catch {
      queueMicrotask(() => setStatus('THE FLOOR IS DARK — 3D COULD NOT LOAD', true));
      return;
    }

    let disposed = false;
    const calmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    renderer.setPixelRatio(PIXELATION);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07040e);
    scene.fog = new THREE.FogExp2(0x07040e, 0.058);

    // The camera is locked ~13 units out, so a tight near/far pair buys the
    // depth precision the borrowed floor's stacked panels need to stop
    // z-fighting.
    const camera = new THREE.PerspectiveCamera(31, 1, 2, 34);
    const focus = new THREE.Vector3(0, STAGE_TOP + AVATAR_HEIGHT / 2 - FRAME_LIFT, 0);

    scene.add(new THREE.HemisphereLight(0x9f7bff, 0x190723, 2.15));

    const key = new THREE.DirectionalLight(0xffedf9, 4.7);
    key.position.set(2.8, 4.5, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.top = 3;
    key.shadow.camera.bottom = -3;
    key.shadow.camera.left = -3;
    key.shadow.camera.right = 3;
    key.shadow.camera.far = 14;
    key.shadow.bias = -0.0015;
    scene.add(key);

    const cyanLight = new THREE.PointLight(0x4bfbff, 24, 9, 1.8);
    cyanLight.position.set(-2.5, 0.9, 2);
    scene.add(cyanLight);

    const pinkLight = new THREE.PointLight(0xff2ca8, 28, 9, 1.8);
    pinkLight.position.set(2.5, 0.2, 2.3);
    scene.add(pinkLight);

    const violetLight = new THREE.PointLight(0xa958ff, 16, 11, 1.9);
    violetLight.position.set(0, 3.1, -2.6);
    scene.add(violetLight);

    const rimMat = new THREE.MeshBasicMaterial({ color: 0xff3cac });
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(RIM_RADIUS, 0.025, 8, 48),
      rimMat,
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = STAGE_TOP + 0.012;
    scene.add(rim);

    // Two more rings that snap outward on the downbeat — a target-lock pulse.
    const pulseMats: THREE.MeshBasicMaterial[] = [];
    const pulseRings: THREE.Mesh[] = [];
    for (let i = 0; i < 2; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: i ? 0x5cfaff : 0xa958ff,
        transparent: true,
        opacity: 0.5,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.012, 6, 40), mat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = STAGE_TOP + 0.02;
      scene.add(ring);
      pulseMats.push(mat);
      pulseRings.push(ring);
    }

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(540);
    for (let i = 0; i < starPositions.length; i += 3) {
      const radius = 3 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;
      starPositions[i] = Math.cos(angle) * radius;
      starPositions[i + 1] = -1 + Math.random() * 5;
      starPositions[i + 2] = -2 - Math.random() * 5;
    }
    starGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(starPositions, 3),
    );
    const stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({
        color: 0xd9c5ff,
        size: 0.028,
        transparent: true,
        opacity: 0.78,
      }),
    );
    scene.add(stars);

    const avatarPivot = new THREE.Group();
    scene.add(avatarPivot);

    const loader = new GLTFLoader();
    let mixer: THREE.AnimationMixer | null = null;
    let floorMixer: THREE.AnimationMixer | null = null;
    let ballMixer: THREE.AnimationMixer | null = null;

    type Quantized = {
      action: THREE.AnimationAction;
      clip: THREE.AnimationClip;
      beats: number;
    };
    const quantized: Quantized[] = [];

    /** Stretch a clip so it spans a whole number of beats at the live tempo. */
    const lockToGrid = (entry: Quantized, beatSec: number) => {
      entry.beats = Math.max(1, Math.round(entry.clip.duration / beatSec));
      entry.action.timeScale = entry.clip.duration / (entry.beats * beatSec);
    };

    /**
     * Period lock alone still lets the loop sit on the wrong part of the bar.
     * This pulls each clip's playhead toward where the beat clock says it
     * should be — a gentle, continuous phase lock rather than a visible jump.
     */
    const phaseLock = (beatsElapsed: number) => {
      for (const entry of quantized) {
        const dur = entry.clip.duration;
        const target = ((beatsElapsed % entry.beats) / entry.beats) * dur;
        let diff = target - entry.action.time;
        if (diff > dur / 2) diff -= dur;
        else if (diff < -dur / 2) diff += dur;
        if (Math.abs(diff) > 0.005) entry.action.time += diff * 0.09;
      }
    };

    /**
     * Loop a GLB's own clip. Quantized clips are registered so a newly detected
     * tempo can re-stretch them — this is the tempo lock: the dance and the
     * floor both close on the grid Kadrea's track is actually running on.
     */
    const playClip = (
      root: THREE.Object3D,
      clip: THREE.AnimationClip | undefined,
      quantize: boolean,
    ) => {
      if (!clip) return null;
      const created = new THREE.AnimationMixer(root);
      const action = created.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      if (quantize) {
        const entry: Quantized = { action, clip, beats: 1 };
        lockToGrid(entry, 60 / (engine.detectedBpm || DEFAULT_BPM));
        quantized.push(entry);
      }
      action.play();
      return created;
    };

    engine.retime = (beatSec: number) => {
      for (const entry of quantized) lockToGrid(entry, beatSec);
    };

    loader.load(FLOOR_URL, (gltf) => {
      if (disposed) return;
      const floor = gltf.scene;
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      floor.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.receiveShadow = true;
        const mats = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of mats) {
          // The panel grid grazes the camera near the horizon; without mips and
          // anisotropy it shreds into moiré streaks at this render scale.
          for (const slot of [
            'map',
            'emissiveMap',
            'roughnessMap',
            'metalnessMap',
            'normalMap',
          ] as const) {
            const tex = (material as unknown as Record<string, THREE.Texture>)[slot];
            if (!tex) continue;
            tex.generateMipmaps = true;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.anisotropy = maxAniso;
            tex.needsUpdate = true;
          }
          const tint = FLOOR_TINTS[material.name];
          if (tint === undefined) continue;
          // Lit panels sit exactly coplanar with the deck they light; bias them
          // forward so they win the depth test instead of striping against it.
          if (material.name !== 'base') {
            material.polygonOffset = true;
            material.polygonOffsetFactor = -2;
            material.polygonOffsetUnits = -2;
          }
          const standard = material as THREE.MeshStandardMaterial;
          standard.color?.setHex(tint);
          if (standard.emissive && standard.emissive.getHex() !== 0x000000) {
            standard.emissive.setHex(tint);
          }
        }
      });
      const size = new THREE.Box3()
        .setFromObject(floor)
        .getSize(new THREE.Vector3());
      floor.scale.setScalar(FLOOR_WIDTH / Math.max(size.x, size.z));
      floor.updateMatrixWorld(true);
      const fitted = new THREE.Box3().setFromObject(floor);
      const center = fitted.getCenter(new THREE.Vector3());
      floor.position.x -= center.x;
      floor.position.z -= center.z;
      floor.position.y += STAGE_TOP - fitted.max.y;
      scene.add(floor);
      floorMixer = playClip(floor, gltf.animations[0], true);
    });

    loader.load(BALL_URL, (gltf) => {
      if (disposed) return;
      const ball = gltf.scene;
      const size = new THREE.Box3()
        .setFromObject(ball)
        .getSize(new THREE.Vector3());
      ball.scale.setScalar(BALL_WIDTH / Math.max(size.x, size.z));
      ball.updateMatrixWorld(true);
      const fitted = new THREE.Box3().setFromObject(ball);
      const center = fitted.getCenter(new THREE.Vector3());
      ball.position.x += BALL_OFFSET_X - center.x;
      ball.position.z += BALL_DEPTH - center.z;
      ball.position.y += BALL_HANG - fitted.min.y;
      scene.add(ball);
      ballMixer = playClip(ball, gltf.animations[0], false);
    });

    loader.load(
      MODEL_URL,
      (gltf) => {
        if (disposed) return;
        const avatar = gltf.scene;
        avatar.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
          const mats = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of mats) {
            if ('roughness' in material) {
              const standard = material as THREE.MeshStandardMaterial;
              standard.roughness = Math.max(0.52, standard.roughness);
            }
          }
        });
        const sourceSize = new THREE.Box3()
          .setFromObject(avatar)
          .getSize(new THREE.Vector3());
        avatar.scale.setScalar(AVATAR_HEIGHT / sourceSize.y);
        avatar.updateMatrixWorld(true);
        const fitted = new THREE.Box3().setFromObject(avatar);
        const center = fitted.getCenter(new THREE.Vector3());
        avatar.position.x -= center.x;
        avatar.position.y += STAGE_TOP - fitted.min.y;
        avatar.position.z -= center.z;
        avatarPivot.add(avatar);
        mixer = playClip(avatar, gltf.animations[0], true);
        setStatus('');
        resync();
      },
      undefined,
      () => {
        if (disposed) return;
        setStatus('THE FLOOR IS DARK — AVATAR COULD NOT LOAD', true);
      },
    );

    let distance = 13;
    let yaw = 0;
    let pitch = 0.21;
    let targetYaw = 0;
    let targetPitch = 0.21;
    let pointerX = 0;
    let pointerY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let idleFor = 0;

    const fitCamera = () => {
      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const reach =
        Math.max(AVATAR_TOP - focus.y, focus.y - STAGE_TOP) + FRAME_PADDING;
      distance = Math.max(
        reach / Math.tan(halfFov),
        FRAME_WIDTH / 2 / (Math.tan(halfFov) * Math.max(camera.aspect, 0.1)),
      );
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(PIXELATION);
      renderer.setSize(rect.width, rect.height, false);
      fitCamera();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        targetYaw -= (event.clientX - lastX) * 0.006;
        targetPitch = THREE.MathUtils.clamp(
          targetPitch + (event.clientY - lastY) * 0.004,
          -0.3,
          0.55,
        );
        lastX = event.clientX;
        lastY = event.clientY;
        idleFor = 0;
        return;
      }
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    };
    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('is-dragging');
    };
    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        canvas.releasePointerCapture(event.pointerId);
      } catch {
        /* pointer already gone */
      }
      canvas.classList.remove('is-dragging');
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    /** Read the low band, find onsets, and keep a running tempo estimate. */
    const readAudio = (now: number) => {
      const { analyser, audio, freq } = engine;
      if (!analyser || !audio || audio.paused || !freq) {
        engine.energy *= 0.9;
        engine.punch *= 0.88;
        return;
      }
      analyser.getByteFrequencyData(freq);

      let bass = 0;
      for (let i = 1; i <= 8; i += 1) bass += freq[i];
      bass /= 8 * 255;
      engine.energy = bass;

      const hist = engine.bassHist;
      hist.push(bass);
      if (hist.length > 48) hist.shift();
      let avg = 0;
      for (const value of hist) avg += value;
      avg /= hist.length || 1;

      if (bass > avg * 1.3 && bass > 0.12 && now - engine.lastOnset > 230) {
        engine.lastOnset = now;
        engine.punch = 1;
        onOnset(now);
      } else {
        engine.punch *= 0.86;
      }

      for (let i = 0; i < 16; i += 1) {
        const el = barRefs.current[i];
        if (!el) continue;
        const from = SPECTRUM_BINS[i];
        const to = SPECTRUM_BINS[i + 1];
        let sum = 0;
        for (let b = from; b < to; b += 1) sum += freq[b];
        const level = Math.min(1, (sum / ((to - from) * 255)) * 1.6);
        el.style.transform = `scaleY(${(0.12 + level * 2.6).toFixed(3)})`;
        el.style.opacity = (0.35 + level * 0.65).toFixed(2);
      }

      if (progressRef.current && audio.duration) {
        progressRef.current.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
      }
      if (timeRef.current) {
        const secs = Math.floor(audio.currentTime);
        timeRef.current.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      }
    };

    const onOnset = (now: number) => {
      const prev = engine.prevOnset;
      engine.prevOnset = now;
      if (prev) {
        let interval = (now - prev) / 1000;
        // Fold octave errors into a musical window before averaging.
        while (interval < 0.34) interval *= 2;
        while (interval > 0.86) interval /= 2;
        engine.intervals.push(interval);
        if (engine.intervals.length > 9) engine.intervals.shift();
        if (engine.intervals.length >= 4) {
          const sorted = [...engine.intervals].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length / 2)];
          const bpm = Math.round(60 / median);
          if (bpm >= 70 && bpm <= 180 && Math.abs(bpm - engine.detectedBpm) >= 1) {
            engine.detectedBpm = bpm;
            setBeatVars();
            engine.retime?.(60 / bpm);
          }
        }
      }
      // Nudge the grid onto the hit only when it has genuinely drifted.
      const beatSec = 60 / (engine.detectedBpm || DEFAULT_BPM);
      const phase = (((now - engine.beatEpoch) / 1000 / beatSec) % 1 + 1) % 1;
      if (Math.min(phase, 1 - phase) > 0.16) resync();
    };

    let raf = 0;
    let lastFrame = performance.now();
    let elapsed = 0;
    engine.beatEpoch = lastFrame;
    engine.lastBeat = -1;

    const frame = () => {
      if (disposed) return;
      raf = window.requestAnimationFrame(frame);
      const frameNow = performance.now();
      const delta = Math.min((frameNow - lastFrame) / 1000, 0.05);
      lastFrame = frameNow;
      const calm = calmQuery.matches;

      readAudio(frameNow);

      const beatSec = 60 / (engine.detectedBpm || DEFAULT_BPM);
      const beats = (frameNow - engine.beatEpoch) / 1000 / beatSec;
      const whole = Math.floor(beats);
      const phase = beats - whole;
      if (whole !== engine.lastBeat) {
        engine.lastBeat = whole;
        engine.combo += 1;
        if (comboRef.current) {
          comboRef.current.textContent = String(engine.combo);
        }
        if (judgeRef.current) {
          judgeRef.current.textContent = JUDGE[whole % JUDGE.length];
        }
      }

      const keys = engine.held;
      const yawInput =
        (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
      const pitchInput =
        (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      if (yawInput || pitchInput) idleFor = 0;
      else idleFor += delta;
      targetYaw += yawInput * delta * 1.5;
      targetPitch = THREE.MathUtils.clamp(
        targetPitch + pitchInput * delta * 0.7,
        -0.3,
        0.55,
      );

      // Attract mode: after six idle seconds the cabinet drifts on its own.
      if (!calm && idleFor > 6) targetYaw += delta * 0.055;

      const ease = Math.min(1, delta * 6);
      yaw += (targetYaw - yaw) * ease;
      pitch += (targetPitch - pitch) * ease;

      const camYaw = yaw + (calm ? 0 : pointerX * 0.3);
      const camPitch = THREE.MathUtils.clamp(
        pitch - (calm ? 0 : pointerY * 0.14),
        -0.35,
        0.6,
      );
      const cosPitch = Math.cos(camPitch);
      // Snap the camera to a coarse lattice — the PS1 vertex judder, cheaply.
      const snap = 96;
      camera.position.set(
        Math.round(Math.sin(camYaw) * cosPitch * distance * snap) / snap,
        Math.round((focus.y + Math.sin(camPitch) * distance) * snap) / snap,
        Math.round(Math.cos(camYaw) * cosPitch * distance * snap) / snap,
      );
      camera.lookAt(focus);

      if (!calm) {
        mixer?.update(delta);
        ballMixer?.update(delta);
        floorMixer?.update(delta);
        phaseLock(beats);

        elapsed += delta;
        stars.rotation.y = elapsed * 0.018;
        avatarPivot.rotation.y = Math.sin(elapsed * 0.55) * 0.055;

        // Driven by the track when it is playing, by the beat grid when not.
        const live = Boolean(engine.analyser && engine.audio && !engine.audio.paused);
        const swell = live ? engine.energy * 2 - 0.35 : Math.cos(phase * Math.PI * 2);
        const hit = live ? engine.punch : Math.max(0, 1 - phase * 3);
        pinkLight.intensity = 26 + swell * 16;
        cyanLight.intensity = 24 - swell * 12;
        violetLight.intensity = 14 + hit * 22;
        rimMat.color.setHex(whole % 2 === 0 ? 0xff3cac : 0x5cfaff);
        avatarPivot.position.y = hit * 0.045;
        key.intensity = 4.7 + hit * 1.6;

        for (let i = 0; i < pulseRings.length; i += 1) {
          const local = (phase + i * 0.5) % 1;
          const scale = RIM_RADIUS + local * (2.4 + (live ? engine.energy * 2.4 : 0.2));
          pulseRings[i].scale.set(scale, scale, 1);
          pulseMats[i].opacity = 0.42 * (1 - local);
        }
      }

      renderer.render(scene, camera);
    };
    raf = window.requestAnimationFrame(frame);

    setBeatVars();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(raf);
      engine.retime = null;
      engine.audio?.pause();
      mixer?.stopAllAction();
      floorMixer?.stopAllAction();
      ballMixer?.stopAllAction();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      scene.traverse((object) => {
        const disposable = object as Partial<THREE.Mesh>;
        disposable.geometry?.dispose();
        const material = disposable.material;
        if (!material) return;
        for (const entry of Array.isArray(material) ? material : [material]) {
          for (const value of Object.values(entry)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          entry.dispose();
        }
      });
      renderer.dispose();
      renderer.forceContextLoss();
    };
  }, [resync, setBeatVars]);

  const panelOpen = screen !== 'floor';

  return (
    <div className="cabinet">
      <h1 className="sr-only">Kadrea — enter the dance floor</h1>

      <canvas
        ref={canvasRef}
        className="stage-canvas"
        role="img"
        aria-label="Interactive 3D model of Kadrea dancing on a lit arcade dance floor. Drag or use the arrow keys to orbit."
      />

      <div className="flare" aria-hidden="true" />
      <div className="scanlines" aria-hidden="true" />
      <div className="dither" aria-hidden="true" />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <div className="hud" ref={hudRef}>
        <header className="topbar">
          <div className="brand">
            <div className="brand-row">
              <span className="wordmark">KADREA</span>
              <span className="brand-star" aria-hidden="true">
                ★
              </span>
            </div>
            <p className="brand-line pixel">MUSIC IN MOTION · CHICAGO</p>
          </div>

          <nav className="nav pixel">
            {SCREENS.map((name) => (
              <button
                key={name}
                type="button"
                className={screen === name ? 'is-active' : undefined}
                onClick={() => setScreen(name)}
                aria-current={screen === name ? 'page' : undefined}
              >
                {name.toUpperCase()}
              </button>
            ))}
          </nav>

          <div className="beat-lock pixel">
            <i aria-hidden="true" />
            <span className="bpm-readout" ref={bpmRef}>
              {DEFAULT_BPM} BPM
            </span>
            <small>BEAT LOCK</small>
          </div>
        </header>

        <div className="lanes" aria-hidden="true">
          <div className="lanes-bed" />
          {[54, 108, 162].map((left) => (
            <div key={left} className="lane-line" style={{ left }} />
          ))}

          <div className="lanes-scroll">
            {STEPS.map((step, index) => (
              <div
                key={index}
                className={`step ${step.accent ? 'is-accent' : ''}`}
                style={{
                  left: LANE_X[step.lane],
                  animationDelay: `calc(var(--loop) * ${step.delay})`,
                }}
              >
                {step.glyph}
              </div>
            ))}
          </div>

          {ARROWS.map((arrow, index) => (
            <div
              key={arrow}
              className={`receptor ${heldKeys.includes(arrow) ? 'is-held' : ''}`}
              style={{ left: LANE_X[index] }}
            >
              {ARROW_GLYPHS[index]}
            </div>
          ))}
        </div>

        <div className="scoreboard" aria-hidden="true">
          <p className="judge" ref={judgeRef}>
            PERFECT
          </p>
          <div className="combo-row">
            <span className="combo pixel" ref={comboRef}>
              0
            </span>
            <small className="pixel">COMBO</small>
          </div>
        </div>

        <p className="model-status pixel" role="status" ref={statusRef}>
          SUMMONING KADREA…
        </p>

        {!started && (
          <div className="start-row">
            <button
              type="button"
              className="start-button pixel"
              onClick={() => play(track)}
            >
              <span aria-hidden="true">▶</span>PRESS START
            </button>
          </div>
        )}

        <div className="links pixel">
          <a
            href={PLATFORMS.spotify.href}
            target="_blank"
            rel="noopener noreferrer"
            data-tint="pink"
          >
            SPOTIFY
            <span aria-hidden="true" style={{ color: '#ff8fd6' }}>
              ↗
            </span>
          </a>
          <a
            href={PLATFORMS.apple.href}
            target="_blank"
            rel="noopener noreferrer"
            data-tint="cyan"
          >
            APPLE MUSIC
            <span aria-hidden="true" style={{ color: '#5cfaff' }}>
              ↗
            </span>
          </a>
          <a
            href="https://soundcloud.com/search?q=kadrea"
            target="_blank"
            rel="noopener noreferrer"
            data-tint="violet"
          >
            SOUNDCLOUD
            <span aria-hidden="true" style={{ color: '#c9a4ff' }}>
              ↗
            </span>
          </a>
        </div>

        <div className="transport">
          <div className="transport-bar">
            <div className="transport-keys">
              <button
                type="button"
                className="skip"
                aria-label="Previous track"
                onClick={() => play((track + TRACKS.length - 1) % TRACKS.length)}
              >
                ◀◀
              </button>
              <button
                type="button"
                className={`play-key ${playing ? 'is-playing' : ''}`}
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={togglePlay}
              >
                {playing ? '❚❚' : '▶'}
              </button>
              <button
                type="button"
                className="skip"
                aria-label="Next track"
                onClick={() => play((track + 1) % TRACKS.length)}
              >
                ▶▶
              </button>
            </div>

            <div className="transport-now">
              <div className="transport-title">
                <strong>{TRACKS[track].title}</strong>
                <span className="pixel" ref={timeRef}>
                  0:00
                </span>
              </div>
              <button
                type="button"
                className="seek"
                ref={seekRef}
                onClick={seek}
                aria-label={`Seek within ${TRACKS[track].title}`}
              >
                <div ref={progressRef} />
              </button>
            </div>

            <div className="spectrum" aria-hidden="true">
              {Array.from({ length: 16 }, (_, index) => (
                <i
                  key={index}
                  ref={(el) => {
                    barRefs.current[index] = el;
                  }}
                />
              ))}
            </div>
          </div>

          <p className="hint pixel">
            SPACE PLAY · ARROWS ORBIT · R RESYNC · H HIDE HUD
          </p>
        </div>

        {panelOpen && (
          <>
            <button
              type="button"
              className="scrim"
              aria-label="Close panel"
              onClick={() => setScreen('floor')}
            />

            <section className="panel">
              <div className="panel-head">
                <h2>{TITLES[screen]}</h2>
                <button
                  type="button"
                  className="panel-back pixel"
                  onClick={() => setScreen('floor')}
                >
                  ESC · BACK
                </button>
              </div>

              <div className="panel-body">
                {screen === 'music' && (
                  <div className="music-grid">
                    <div className="track-list">
                      {TRACKS.map((entry, index) => (
                        <button
                          key={entry.title}
                          type="button"
                          className={`track ${track === index ? 'is-current' : ''}`}
                          onClick={() => play(index)}
                        >
                          <span className="track-index pixel">
                            {String(index + 1).padStart(2, '0')}
                          </span>
                          <span className="track-meta">
                            <strong>{entry.title}</strong>
                            <span className="track-rating" aria-hidden="true">
                              {Array.from({ length: 5 }, (_, step) => (
                                <i
                                  key={step}
                                  style={
                                    step < entry.rating
                                      ? { background: entry.tint }
                                      : undefined
                                  }
                                />
                              ))}
                            </span>
                          </span>
                          {track === index && (
                            <span className="track-now pixel">NOW</span>
                          )}
                        </button>
                      ))}

                      <p className="panel-note pixel">
                        THE FLOOR LISTENS TO WHICHEVER TRACK IS PLAYING AND
                        RE-TIMES THE DANCE TO ITS TEMPO. THE STREAMING PLAYER TO
                        THE RIGHT IS SEPARATE.
                      </p>
                    </div>

                    <div className="stream">
                      <div className="stream-tabs pixel">
                        {(Object.keys(PLATFORMS) as PlatformKey[]).map((name) => (
                          <button
                            key={name}
                            type="button"
                            className={platform === name ? 'is-active' : undefined}
                            onClick={() => setPlatform(name)}
                            aria-pressed={platform === name}
                          >
                            {PLATFORMS[name].label}
                          </button>
                        ))}
                        <a
                          className="stream-out pixel"
                          href={activePlatform.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Open Kadrea on ${activePlatform.label}`}
                        >
                          ↗
                        </a>
                      </div>

                      <div className="stream-frame">
                        <iframe
                          key={platform}
                          src={activePlatform.embed}
                          title="Kadrea streaming player"
                          loading="lazy"
                          allow="encrypted-media; clipboard-write; fullscreen; picture-in-picture"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {screen === 'merch' && (
                  <div className="merch">
                    <p className="panel-note pixel" style={{ margin: 0 }}>
                      DROP PRODUCT SHOTS INTO THE SLOTS — NAMES AND PRICES ARE
                      PLACEHOLDERS UNTIL YOU SEND ME THE REAL DROP.
                    </p>
                    <div className="merch-grid">
                      {MERCH.map((item) => (
                        <div key={item.name} className="merch-card">
                          <div className="merch-slot pixel">{item.slot}</div>
                          <div className="merch-line">
                            <strong>{item.name}</strong>
                            <span className="pixel">$--</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
