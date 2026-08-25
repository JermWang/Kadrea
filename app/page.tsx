'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Where the deck sends people. These are working search links so the player is
 * never a dead end — swap in Kadrea's canonical profile URLs once they exist.
 */
const PLATFORMS = [
  { name: 'Spotify', href: 'https://open.spotify.com/search/Kadrea' },
  { name: 'Apple Music', href: 'https://music.apple.com/us/search?term=Kadrea' },
  { name: 'SoundCloud', href: 'https://soundcloud.com/search?q=Kadrea' },
] as const;

type PlatformName = (typeof PLATFORMS)[number]['name'];

/** Web export of the Meshy biped: 24 bones, textured, `All_Night_Dance` loop. */
const MODEL_URL = '/models/kadrea-meshy-web.glb';
/** Borrowed club set pieces, both carrying their own animation clip. */
const FLOOR_URL = '/models/dancefloor.glb';
const BALL_URL = '/models/discoball.glb';
/** Where the avatar's feet land — the surface of the dance floor. */
const STAGE_TOP = -1.63;
const AVATAR_HEIGHT = 3.55;
/** Breathing room the camera keeps around the avatar, in world units. */
const FRAME_PADDING = 0.25;
const FRAME_WIDTH = 2.6;
const FOCUS = new THREE.Vector3(0, STAGE_TOP + AVATAR_HEIGHT / 2, 0);

/**
 * Source floor is a 24-unit square club floor. Wide enough here that its far
 * edge dissolves into the fog instead of showing a hard rim mid-frame.
 */
const FLOOR_WIDTH = 14;
/** Radius of Kadrea's lit ring — kept inside the frame at the default camera. */
const RIM_RADIUS = 1.15;

const BALL_WIDTH = 0.9;
/**
 * Kadrea's head reaches STAGE_TOP + AVATAR_HEIGHT ≈ 1.92. The ball hangs above
 * that, set back and off to one side so it never reads as a halo behind her.
 */
const BALL_HANG = 2;
const BALL_DEPTH = -2.2;
const BALL_OFFSET_X = -1.55;

/**
 * The borrowed floor ships a rainbow of panel colours. Retint them into
 * Kadrea's pink/violet/cyan palette, keyed by the source material names.
 */
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

const ARROW_KEYS = ['ArrowLeft', 'ArrowUp', 'ArrowDown', 'ArrowRight'] as const;
type ArrowKey = (typeof ARROW_KEYS)[number];
const ARROW_GLYPHS: Record<ArrowKey, string> = {
  ArrowLeft: '←',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowRight: '→',
};

/** Relative heights for the beat meter bars. */
const BEAT_BARS = [0.5, 0.85, 0.35, 1, 0.6, 0.9, 0.45, 0.75];

type Status = 'loading' | 'ready' | 'error';

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(false);
  const heldRef = useRef<Set<ArrowKey>>(new Set());

  const [status, setStatus] = useState<Status>('loading');
  const [playing, setPlaying] = useState(false);
  const [held, setHeld] = useState<ArrowKey[]>([]);
  const [platform, setPlatform] = useState<PlatformName>('Spotify');

  const activePlatform =
    PLATFORMS.find((entry) => entry.name === platform) ?? PLATFORMS[0];

  // The render loop reads this ref, so toggling playback never rebuilds the scene.
  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      // No WebGL context. Deferred so the failure lands in its own render pass
      // rather than cascading out of this effect body.
      queueMicrotask(() => setStatus('error'));
      return;
    }

    const calmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let disposed = false;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07040e);
    // Tuned against the camera distance below — thicker fog swallows the avatar.
    scene.fog = new THREE.FogExp2(0x07040e, 0.065);

    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);

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

    // Kadrea's signature: a lit ring marking her spot on the borrowed floor.
    const stageRimMaterial = new THREE.MeshBasicMaterial({ color: 0xff3cac });
    const stageRim = new THREE.Mesh(
      new THREE.TorusGeometry(RIM_RADIUS, 0.025, 8, 48),
      stageRimMaterial,
    );
    stageRim.rotation.x = Math.PI / 2;
    stageRim.position.y = STAGE_TOP + 0.012;
    scene.add(stageRim);

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(360);
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
        size: 0.025,
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

    /** Start a GLB's own clip on its own mixer, looping forever. */
    const playClip = (root: THREE.Object3D, clip?: THREE.AnimationClip) => {
      if (!clip) return null;
      const created = new THREE.AnimationMixer(root);
      const action = created.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
      action.play();
      return created;
    };

    // The dance floor, borrowed and retinted into Kadrea's palette.
    loader.load(FLOOR_URL, (gltf) => {
      if (disposed) return;
      const floor = gltf.scene;

      floor.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.receiveShadow = true;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          const tint = FLOOR_TINTS[material.name];
          if (tint === undefined) continue;
          const standard = material as THREE.MeshStandardMaterial;
          standard.color?.setHex(tint);
          // Only retint panels that were already built to glow.
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

      // Drop it so its top face is exactly where Kadrea stands.
      const fitted = new THREE.Box3().setFromObject(floor);
      const center = fitted.getCenter(new THREE.Vector3());
      floor.position.x -= center.x;
      floor.position.z -= center.z;
      floor.position.y += STAGE_TOP - fitted.max.y;

      scene.add(floor);
      floorMixer = playClip(floor, gltf.animations[0]);
    });

    // The disco ball, hung above the floor on its own motor.
    loader.load(BALL_URL, (gltf) => {
      if (disposed) return;
      const ball = gltf.scene;

      const size = new THREE.Box3()
        .setFromObject(ball)
        .getSize(new THREE.Vector3());
      ball.scale.setScalar(BALL_WIDTH / Math.max(size.x, size.z));
      ball.updateMatrixWorld(true);

      // Anchor by the underside so the mount runs off the top of frame.
      const fitted = new THREE.Box3().setFromObject(ball);
      const center = fitted.getCenter(new THREE.Vector3());
      ball.position.x += BALL_OFFSET_X - center.x;
      ball.position.z += BALL_DEPTH - center.z;
      ball.position.y += BALL_HANG - fitted.min.y;

      scene.add(ball);
      ballMixer = playClip(ball, gltf.animations[0]);
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
          // Skinned bounds do not follow the pose, so culling would pop it out.
          object.frustumCulled = false;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            // Meshy bakes a glossy finish that reads as plastic under the rig.
            if ('roughness' in material) {
              const standard = material as THREE.MeshStandardMaterial;
              standard.roughness = Math.max(0.52, standard.roughness);
            }
          }
        });

        // Scale first, then measure again: the skinned bounds move with it.
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

        mixer = playClip(avatar, gltf.animations[0]);
        setStatus('ready');
      },
      undefined,
      () => {
        if (disposed) return;
        setStatus('error');
      },
    );

    // --- Camera rig -------------------------------------------------------
    let distance = 7.3;
    let yaw = 0;
    let pitch = 0.06;
    let targetYaw = 0;
    let targetPitch = 0.06;
    let pointerX = 0;
    let pointerY = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    /** Pull back far enough that the whole dancer stays in frame at any aspect. */
    const fitCamera = () => {
      const halfFov = THREE.MathUtils.degToRad(camera.fov) / 2;
      const forHeight = (AVATAR_HEIGHT / 2 + FRAME_PADDING) / Math.tan(halfFov);
      const forWidth =
        FRAME_WIDTH / 2 / (Math.tan(halfFov) * Math.max(camera.aspect, 0.1));
      distance = Math.max(forHeight, forWidth);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
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
      canvas.releasePointerCapture(event.pointerId);
      canvas.classList.remove('is-dragging');
    };

    const isArrow = (value: string): value is ArrowKey =>
      (ARROW_KEYS as readonly string[]).includes(value);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isArrow(event.key) || event.metaKey || event.ctrlKey) return;
      event.preventDefault();
      if (heldRef.current.has(event.key)) return;
      heldRef.current.add(event.key);
      setHeld([...heldRef.current]);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (!isArrow(event.key)) return;
      heldRef.current.delete(event.key);
      setHeld([...heldRef.current]);
    };

    const onBlur = () => {
      heldRef.current.clear();
      setHeld([]);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    // --- Render loop ------------------------------------------------------
    // Timer.connect keeps deltas sane when the tab is backgrounded.
    const timer = new THREE.Timer();
    timer.connect(document);
    let elapsed = 0;

    renderer.setAnimationLoop(() => {
      timer.update();
      const delta = Math.min(timer.getDelta(), 0.05);
      const isPlaying = playingRef.current;
      const calm = calmQuery.matches;

      const keys = heldRef.current;
      const yawInput =
        (keys.has('ArrowLeft') ? 1 : 0) - (keys.has('ArrowRight') ? 1 : 0);
      const pitchInput =
        (keys.has('ArrowUp') ? 1 : 0) - (keys.has('ArrowDown') ? 1 : 0);
      targetYaw += yawInput * delta * 1.5;
      targetPitch = THREE.MathUtils.clamp(
        targetPitch + pitchInput * delta * 0.7,
        -0.3,
        0.55,
      );

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
      camera.position.set(
        Math.sin(camYaw) * cosPitch * distance,
        FOCUS.y + Math.sin(camPitch) * distance,
        Math.cos(camYaw) * cosPitch * distance,
      );
      camera.lookAt(FOCUS);

      if (mixer && isPlaying) mixer.update(delta);

      // Reduced motion still allows deliberate steering, just no idle drift.
      if (!calm) {
        // The ball just turns; the floor panels lift with the beat.
        ballMixer?.update(delta);
        floorMixer?.update(delta * (isPlaying ? 1 : 0.35));

        elapsed += delta;
        stars.rotation.y = elapsed * 0.018;
        avatarPivot.rotation.y = Math.sin(elapsed * 0.55) * 0.055;
        // While the clip runs it carries its own motion; only idle needs a float.
        avatarPivot.position.y = isPlaying
          ? 0
          : Math.sin(elapsed * 0.8) * 0.012;

        const beat = Math.sin(elapsed * 6.8);
        pinkLight.intensity = isPlaying ? 28 + beat * 8 : 23;
        cyanLight.intensity = isPlaying ? 24 + Math.cos(elapsed * 6.8) * 7 : 20;
        stageRimMaterial.color.setHex(
          isPlaying && beat > 0 ? 0x5cfaff : 0xff3cac,
        );
      }

      renderer.render(scene, camera);
    });

    return () => {
      disposed = true;
      renderer.setAnimationLoop(null);
      timer.disconnect();
      mixer?.stopAllAction();
      floorMixer?.stopAllAction();
      ballMixer?.stopAllAction();
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);

      // Covers Points and SkinnedMesh too, and releases the GLB's textures.
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
  }, []);

  return (
    <main className="experience">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Kadrea home">
          KADREA<span aria-hidden="true">★</span>
        </a>
        <p className="topline">MUSIC IN MOTION · CHICAGO</p>
        <span className="live-chip">
          <i aria-hidden="true" />
          3D DANCEFLOOR
        </span>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">WELCOME TO THE AFTERIMAGE</p>
          <h1>
            ENTER THE
            <br />
            <span>DANCE FLOOR</span>
          </h1>
          <p className="lede">
            Pick a platform. Press play. Kadrea takes it from here.
          </p>
        </div>

        <div className="stage-shell">
          <canvas
            ref={canvasRef}
            className="stage-canvas"
            role="img"
            aria-label="Interactive 3D model of Kadrea dancing on a lit stage. Drag it or use the arrow keys to orbit."
          />
          <div className="stage-halo" aria-hidden="true" />
          <p className="stage-index">KDR / 001</p>
          <p className="stage-mode">DRAG TO ORBIT · ARROW KEYS TO STEER</p>

          <p
            className={`model-status ${status === 'error' ? 'error' : ''}`}
            role="status"
          >
            {status === 'loading' && 'SUMMONING KADREA…'}
            {status === 'error' && 'THE FLOOR IS DARK — 3D COULD NOT LOAD'}
          </p>

          <div className="dance-arrows" aria-hidden="true">
            {ARROW_KEYS.map((arrow) => (
              <span
                key={arrow}
                className={held.includes(arrow) ? 'is-held' : undefined}
              >
                {ARROW_GLYPHS[arrow]}
              </span>
            ))}
          </div>
        </div>

        <aside className="side-note">
          <span>PS1 SOUL</span>
          <i aria-hidden="true" />
          <span>CLUB FUTURE</span>
        </aside>
      </section>

      <section className="music-deck" aria-label="Kadrea music player">
        <div className="now-playing">
          <span className="track-number" aria-hidden="true">
            01
          </span>
          <div>
            <p>NOW ENTERING</p>
            <strong>KADREA RADIO</strong>
          </div>
        </div>

        <button
          className={`play-button ${playing ? 'is-playing' : ''}`}
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-pressed={playing}
          aria-label={playing ? 'Calm the dance floor' : 'Start the dance floor'}
        >
          <span aria-hidden="true">{playing ? 'Ⅱ' : '▶'}</span>
        </button>

        <div className="platforms" role="group" aria-label="Streaming platform">
          {PLATFORMS.map(({ name }) => (
            <button
              key={name}
              type="button"
              className={platform === name ? 'active' : undefined}
              onClick={() => setPlatform(name)}
              aria-pressed={platform === name}
            >
              {name}
            </button>
          ))}
        </div>

        <a
          className="deck-cta"
          href={activePlatform.href}
          target="_blank"
          rel="noopener noreferrer"
        >
          LISTEN<span aria-hidden="true"> ↗</span>
          <span className="sr-only"> on {platform}, opens in a new tab</span>
        </a>

        <div className="beat-meter" aria-hidden="true">
          {BEAT_BARS.map((ratio, index) => (
            <i
              key={index}
              style={
                { '--ratio': ratio, '--bar': index } as React.CSSProperties
              }
            />
          ))}
        </div>
      </section>
    </main>
  );
}
