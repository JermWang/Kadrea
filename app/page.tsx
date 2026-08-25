'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const platforms = ['Spotify', 'Apple Music', 'SoundCloud'] as const;

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playingRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [modelError, setModelError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [platform, setPlatform] = useState<(typeof platforms)[number]>('Spotify');

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07040e);
    scene.fog = new THREE.FogExp2(0x07040e, 0.085);

    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(0, 0.15, 5.7);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.35));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene.add(new THREE.HemisphereLight(0x9f7bff, 0x190723, 2.15));

    const key = new THREE.DirectionalLight(0xffedf9, 4.7);
    key.position.set(2.8, 4.5, 4);
    key.castShadow = true;
    scene.add(key);

    const cyanLight = new THREE.PointLight(0x4bfbff, 24, 9, 1.8);
    cyanLight.position.set(-2.5, 0.9, 2);
    scene.add(cyanLight);

    const pinkLight = new THREE.PointLight(0xff2ca8, 28, 9, 1.8);
    pinkLight.position.set(2.5, 0.2, 2.3);
    scene.add(pinkLight);

    const stageMaterial = new THREE.MeshStandardMaterial({
      color: 0x171020,
      metalness: 0.72,
      roughness: 0.3,
    });
    const stage = new THREE.Mesh(
      new THREE.CylinderGeometry(1.65, 1.85, 0.16, 32),
      stageMaterial,
    );
    stage.position.y = -1.72;
    stage.receiveShadow = true;
    scene.add(stage);

    const stageRimMaterial = new THREE.MeshBasicMaterial({ color: 0xff3cac });
    const stageRim = new THREE.Mesh(
      new THREE.TorusGeometry(1.74, 0.025, 8, 48),
      stageRimMaterial,
    );
    stageRim.rotation.x = Math.PI / 2;
    stageRim.position.y = -1.63;
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

    const avatarPivot = new THREE.Group();
    scene.add(avatarPivot);

    let mixer: THREE.AnimationMixer | null = null;
    let loadedAvatar: THREE.Object3D | null = null;
    const loader = new GLTFLoader();
    loader.load(
      '/models/kadrea-meshy-web.glb',
      (gltf) => {
        const avatar = gltf.scene;
        loadedAvatar = avatar;
        avatar.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.castShadow = true;
          object.receiveShadow = true;
          object.frustumCulled = false;
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          materials.forEach((material) => {
            if ('roughness' in material) {
              (material as THREE.MeshStandardMaterial).roughness = Math.max(
                0.52,
                (material as THREE.MeshStandardMaterial).roughness,
              );
            }
          });
        });

        const sourceBox = new THREE.Box3().setFromObject(avatar);
        const sourceSize = sourceBox.getSize(new THREE.Vector3());
        avatar.scale.setScalar(3.55 / sourceSize.y);
        avatar.updateMatrixWorld(true);

        const fittedBox = new THREE.Box3().setFromObject(avatar);
        const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
        avatar.position.x -= fittedCenter.x;
        avatar.position.y += -1.63 - fittedBox.min.y;
        avatar.position.z -= fittedCenter.z;
        avatar.rotation.y = 0;
        avatarPivot.add(avatar);

        if (gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(avatar);
          const action = mixer.clipAction(gltf.animations[0]);
          action.setLoop(THREE.LoopRepeat, Number.POSITIVE_INFINITY);
          action.clampWhenFinished = false;
          action.play();
        }
        setLoading(false);
      },
      undefined,
      () => {
        setLoading(false);
        setModelError(true);
      },
    );

    const starGeometry = new THREE.BufferGeometry();
    const starPositions = new Float32Array(360);
    for (let i = 0; i < starPositions.length; i += 3) {
      const radius = 3 + Math.random() * 5;
      const angle = Math.random() * Math.PI * 2;
      starPositions[i] = Math.cos(angle) * radius;
      starPositions[i + 1] = -1 + Math.random() * 5;
      starPositions[i + 2] = -2 - Math.random() * 5;
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
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

    let pointerX = 0;
    let pointerY = 0;
    const onPointerMove = (event: PointerEvent) => {
      pointerX = event.clientX / window.innerWidth - 0.5;
      pointerY = event.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      camera.aspect = rect.width / Math.max(rect.height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(rect.width, rect.height, false);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const clock = new THREE.Clock();
    let elapsed = 0;
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      elapsed += delta;
      if (mixer && playingRef.current) mixer.update(delta);
      discoBall.rotation.y = elapsed * 0.32;
      stars.rotation.y = elapsed * 0.018;
      avatarPivot.rotation.y = Math.sin(elapsed * 0.55) * 0.055;
      avatarPivot.position.y = playingRef.current
        ? 0
        : Math.sin(elapsed * 0.8) * 0.012;
      camera.position.x += (pointerX * 0.38 - camera.position.x) * 0.035;
      camera.position.y +=
        (0.15 - pointerY * 0.18 - camera.position.y) * 0.035;
      camera.lookAt(0, 0.05, 0);
      pinkLight.intensity = playingRef.current
        ? 28 + Math.sin(elapsed * 6.8) * 8
        : 23;
      cyanLight.intensity = playingRef.current
        ? 24 + Math.cos(elapsed * 6.8) * 7
        : 20;
      stageRimMaterial.color.setHex(
        playingRef.current && Math.sin(elapsed * 6.8) > 0 ? 0x5cfaff : 0xff3cac,
      );
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      mixer?.stopAllAction();
      if (loadedAvatar) avatarPivot.remove(loadedAvatar);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
    };
  }, []);

  return (
    <main className="experience">
      <div className="grain" aria-hidden="true" />
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Kadrea home">
          KADREA<span>★</span>
        </a>
        <p className="topline">MUSIC IN MOTION · CHICAGO</p>
        <span className="live-chip">
          <i />
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
          <p className="lede">Pick a platform. Press play. Kadrea takes it from here.</p>
        </div>

        <div className="stage-shell" aria-label="Interactive 3D model of Kadrea">
          <canvas ref={canvasRef} className="stage-canvas" />
          <div className="stage-halo" aria-hidden="true" />
          <p className="stage-index">KDR / 001</p>
          <p className="stage-mode">MOVE YOUR CURSOR · PRESS PLAY TO DANCE</p>
          {loading && <p className="model-status">SUMMONING KADREA…</p>}
          {modelError && (
            <p className="model-status error">MODEL COULD NOT ENTER THE FLOOR</p>
          )}
          <div className="dance-arrows" aria-hidden="true">
            <span>←</span>
            <span>↑</span>
            <span>↓</span>
            <span>→</span>
          </div>
        </div>

        <aside className="side-note">
          <span>PS1 SOUL</span>
          <i />
          <span>CLUB FUTURE</span>
        </aside>
      </section>

      <section className="music-deck" aria-label="Kadrea music player">
        <div className="now-playing">
          <span className="track-number">01</span>
          <div>
            <p>NOW ENTERING</p>
            <strong>KADREA RADIO</strong>
          </div>
        </div>

        <button
          className={`play-button ${playing ? 'is-playing' : ''}`}
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-label={playing ? 'Pause dance preview' : 'Play dance preview'}
        >
          <span>{playing ? 'Ⅱ' : '▶'}</span>
        </button>

        <div className="platforms" aria-label="Choose a streaming platform">
          {platforms.map((name) => (
            <button
              key={name}
              type="button"
              className={platform === name ? 'active' : ''}
              onClick={() => setPlatform(name)}
              aria-pressed={platform === name}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="beat-meter" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((bar) => (
            <i key={bar} style={{ '--bar': bar } as React.CSSProperties} />
          ))}
        </div>
      </section>
    </main>
  );
}
