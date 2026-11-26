const trigger = document.querySelector('#load-model');
const status = document.querySelector('#viewer-status');
const stage = document.querySelector('#stage');
const parts = document.querySelector('#parts');
const info = document.querySelector('#part-info');
const poster = document.querySelector('#poster');
const viewControls = document.querySelector('#view-controls');
const views = {
  front: [0, .28, 1],
  back: [0, .33, -1],
  reset: [.561, .40, .804]
};

const descriptions = {
  case: 'Картер служит корпусом кривошипно-шатунного механизма. Снизу расположены лапы крепления.',
  low: 'Два боковых цилиндра первой ступени предварительно сжимают воздух.',
  high: 'Центральный цилиндр второй ступени сжимает воздух после промежуточного охлаждения.',
  cooler: 'Между ступенями воздух идёт через промежуточный охладитель. Его обдувает вентилятор.',
  filters: 'Два воздушных фильтра очищают воздух перед поступлением в цилиндры первой ступени.'
};

function showControls(message) {
  viewControls.hidden = false;
  parts.hidden = false;
  trigger.hidden = true;
  status.textContent = message;
}

function showPart(name) {
  for (const button of parts.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.part === name));
  }
  info.textContent = descriptions[name] ?? '';
  info.hidden = !name;
}

function bindControls(setView, selectPart) {
  parts.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-part]');
    if (button) selectPart(button.dataset.part);
  });
  for (const name of Object.keys(views)) {
    document.getElementById(name).addEventListener('click', () => setView(name));
  }
}

async function openImageViewer() {
  const count = 16;
  const angles = Array.from({ length: count }, (_, index) =>
    './views/angle-' + String(index).padStart(2, '0') + '.jpg');
  const first = new Image();
  first.src = angles[1];
  await first.decode();
  for (const url of angles) {
    const image = new Image();
    image.src = url;
  }

  let angle = 1;
  let part = '';
  let scale = 1;
  let dragStart = null;
  const draw = () => {
    poster.src = part ? './views/part-' + part + '.jpg' : angles[angle];
    poster.style.transform = 'scale(' + scale + ')';
    showPart(part);
  };
  const turn = (steps) => {
    angle = (angle + steps % count + count) % count;
    part = '';
    draw();
  };
  const zoom = (step) => {
    scale = Math.min(1.8, Math.max(1, scale + step));
    draw();
  };
  bindControls((name) => {
    const presets = { front: 0, back: 8, reset: 1 };
    angle = presets[name];
    if (name === 'reset') scale = 1;
    part = '';
    draw();
  }, (name) => {
    part = part === name ? '' : name;
    draw();
  });

  stage.classList.add('image-viewer');
  stage.tabIndex = 0;
  stage.setAttribute('aria-label', 'Обзор компрессора по ракурсам');
  stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || !event.isPrimary || event.button !== 0) return;
    dragStart = event.clientX;
    stage.setPointerCapture(event.pointerId);
  });
  stage.addEventListener('pointermove', (event) => {
    if (dragStart === null || !event.isPrimary) return;
    const steps = Math.trunc((event.clientX - dragStart) / 22);
    if (!steps) return;
    dragStart += steps * 22;
    turn(-steps);
  });
  const finishDrag = () => { dragStart = null; };
  stage.addEventListener('pointerup', finishDrag);
  stage.addEventListener('pointercancel', finishDrag);
  stage.addEventListener('keydown', (event) => {
    if (event.target !== stage) return;
    const actions = { ArrowLeft: () => turn(-1), ArrowRight: () => turn(1),
      '+': () => zoom(.15), '-': () => zoom(-.15) };
    if (!actions[event.key]) return;
    event.preventDefault();
    actions[event.key]();
  });
  document.querySelector('#zoom-in').hidden = false;
  document.querySelector('#zoom-out').hidden = false;
  document.querySelector('#zoom-in').addEventListener('click', () => zoom(.15));
  document.querySelector('#zoom-out').addEventListener('click', () => zoom(-.15));
  draw();
  showControls('Режим обзора. Проведите влево или вправо, чтобы сменить ракурс. Кнопки + и − меняют масштаб.');
}

trigger.addEventListener('click', async () => {
  trigger.disabled = true;
  trigger.textContent = 'Загрузка…';
  status.textContent = 'Загружаем модель компрессора.';
  let renderer;

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!context) {
      await openImageViewer();
      return;
    }
    const [THREE, { OrbitControls }, { GLTFLoader }] = await Promise.all([
      import('three'),
      import('./vendor/OrbitControls.js'),
      import('./vendor/GLTFLoader.js')
    ]);
    renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.35;
    renderer.domElement.setAttribute('aria-label', 'Интерактивная модель компрессора КТ6');
    renderer.domElement.tabIndex = 0;

    const { scene: compressor } = await new GLTFLoader().loadAsync('./kt6.glb');
    const bounds = new THREE.Box3().setFromObject(compressor);
    const center = bounds.getCenter(new THREE.Vector3());
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x26383f);
    scene.add(compressor);
    scene.add(new THREE.HemisphereLight(0xe2f7ff, 0x748083, 2.55));

    const key = new THREE.DirectionalLight(0xffebdc, 3.0);
    key.position.set(4, 7, 6);
    const fill = new THREE.DirectionalLight(0xa9d7ff, 2.1);
    fill.position.set(-4, 3, -6);
    scene.add(key, fill);

    const camera = new THREE.PerspectiveCamera(37, 1, 0.05, 70);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minDistance = 2.75;
    controls.maxDistance = 13;
    controls.target.copy(center);
    const distance = () => Math.max(6.2, 6.25 / Math.min(camera.aspect, 1.33));
    const draw = () => renderer.render(scene, camera);
    function view(name) {
      camera.position.copy(center).addScaledVector(new THREE.Vector3(...views[name]).normalize(), distance());
      controls.update();
      draw();
    }
    function resize() {
      camera.aspect = stage.clientWidth / stage.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(stage.clientWidth, stage.clientHeight, false);
      draw();
    }

    const meshes = [];
    compressor.traverse((object) => {
      if (!object.isMesh) return;
      const original = Array.isArray(object.material) ? object.material : [object.material];
      object.material = Array.isArray(object.material) ? original.map((m) => m.clone()) : original[0].clone();
      meshes.push({ group: object.name.split('__')[0], mats: Array.isArray(object.material) ? object.material : [object.material] });
    });

    let selected = '';
    function highlight(name) {
      selected = selected === name ? '' : name;
      showPart(selected);
      for (const { group, mats } of meshes) {
        const active = selected === group;
        for (const mat of mats) {
          mat.emissive.setHex(active ? 0xee5d1f : 0x000000);
          mat.emissiveIntensity = active ? .55 : 0;
        }
      }
      if (selected === 'cooler') view('back');
      else draw();
    }

    bindControls((name) => {
      if (name === 'reset' && selected) highlight(selected);
      view(name);
    }, highlight);

    renderer.domElement.addEventListener('keydown', (event) => {
      const movements = { ArrowLeft: [-.15, 0], ArrowRight: [.15, 0], ArrowUp: [0, -.12], ArrowDown: [0, .12] };
      const movement = movements[event.key];
      if (!movement) return;
      event.preventDefault();
      const offset = camera.position.clone().sub(center);
      const angles = new THREE.Spherical().setFromVector3(offset);
      angles.theta += movement[0];
      angles.phi += movement[1];
      angles.makeSafe();
      camera.position.copy(center).add(new THREE.Vector3().setFromSpherical(angles));
      controls.update();
    });

    stage.prepend(renderer.domElement);
    poster.hidden = true;
    controls.addEventListener('change', draw);
    new ResizeObserver(resize).observe(stage);
    resize();
    view('reset');
    showControls('Проведите по модели, чтобы повернуть. Щипок или колёсико меняют масштаб. Ниже можно выделить детали.');
  } catch (error) {
    renderer?.dispose();
    renderer?.domElement.remove();
    poster.hidden = false;
    console.warn('3D viewer could not start', error);
    try {
      await openImageViewer();
    } catch (fallbackError) {
      trigger.disabled = false;
      trigger.textContent = 'Повторить';
      status.textContent = 'Модель не загрузилась. Доступны изображение и файл GLB.';
      console.warn('Could not load model views', fallbackError);
    }
  }
});
