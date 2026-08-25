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
/** Where the avatar's feet land — the lit rim of the podium. */
const STAGE_TOP = -1.63;
const AVATAR_HEIGHT = 3.55;
/** Breathing room the camera keeps around the avatar, in world units. */
const FRAME_PADDING = 0.25;
const FRAME_WIDTH = 2.6;
const FOCUS = new THREE.Vector3(0, STAGE_TOP + AVATAR_HEIGHT / 2, 0);

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

    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.85, 0.16, 32),
      new THREE.MeshStandardMaterial({
        color: 0x171020,
        metalness: 0.72,
        roughness: 0.3,
      }),
    );
    stage.position.y = STAGE_TOP - 0.09;
    stage.receiveShadow = true;
    scene.add(stage);

    const stageRimMaterial = new THREE.MeshBasicMaterial({ color: 0xff3cac });
    const stageRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.74, 0.025, 8, 48),
      stageRimMaterial,
    );
    stageRim.rotation.x = Math.PI / 2;
    stageRim.position.y = STAGE_TOP;
    scene.add(stageRim);

    const discoBall = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.26, 3),
      new THREE.MeshStandardMaterial({
        color: 0xd8e2ff,
        emissive: 0x241346,
        metalness: 1,
        roughness: 0.12,
        flatShading: true,
      }),
    );
    discoBall.position.set(0, 2.05, 0);
    scene.add(discoBall);

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

    let mixer: THREE.AnimationMixer | null = null;

    new GLTFLoader().load(
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

        const clip = gltf.animations[0];
        if (clip) {
          mixer = new THREE.AnimationMixer(avatar);
          const action = mixer.clipAction(clip);
          action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
          action.play();
        }

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
        elapsed += delta;
        discoBall.rotation.y = elapsed * 0.32;
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
