// 匯入 three.js 及後處理套件
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// 全域設定參數
const CONFIG = {
  intro: {
    count: 10000,   // 進場動畫粒子數量
    duration: 5000 // 進場動畫持續時間 (毫秒)
  },
  background: {
    count: 2000    // 背景常駐粒子數量
  },
  color: {
    r: 120 / 255,  // 粒子顏色 R (0~1)
    g: 180 / 255,  // 粒子顏色 G (0~1)
    b: 240 / 255   // 粒子顏色 B (0~1)
  },
  colorIntensity: 4, // 顏色強度放大倍率
  bloom: {
    strength: 1.4,  // Bloom 強度
    radius: 0.5,    // Bloom 模糊半徑
    threshold: 0.15 // Bloom 啟動亮度閾值
  },
  mouse: {
    force: 0.35, // 滑鼠對粒子的排斥力道
    radius: 8    // 滑鼠影響半徑
  },
  isMobile: /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) // 是否為行動裝置
};

// 行動裝置下調整粒子數，以避免太吃效能
if (CONFIG.isMobile) {
  CONFIG.intro.count = 8000;      // 手機版進場粒子
  CONFIG.background.count = 2000; // 手機版背景粒子
}

// three.js 場景相關全域變數
let scene;           // 場景
let camera;          // 相機
let renderer;        // 渲染器
let composer;        // 後處理合成器
let bloomPass;       // Bloom 特效 Pass
let particles;       // 粒子 Points 物件

// 粒子狀態 / 動畫狀態
let count = CONFIG.intro.count;       // 目前粒子總數
let phase = 'intro';                  // 動畫階段: 'intro' 或 'background'
let introComplete = false;            // 是否已經進入背景階段
let mouse = { x: 0, y: 0, active: false }; // 滑鼠在 NDC 座標與啟用狀態
let targetPositions = null;           // 背景階段時的粒子目標位置陣列

// 初始化 three.js 場景與動畫
function init() {
  // 建立場景
  scene = new THREE.Scene();

  // 建立透視相機
  camera = new THREE.PerspectiveCamera(
    75,                       // 視角 (FOV，單位度)
    innerWidth / innerHeight, // 畫面比例
    0.1,                      // 近截平面
    1000                      // 遠截平面
  );
  camera.position.z = 30; // 相機往後拉一點

  // 建立 WebGL 渲染器
  renderer = new THREE.WebGLRenderer({
    antialias: true,               // 抗鋸齒
    alpha: true,                   // 啟用透明背景
    powerPreference: 'high-performance' // 優先高效能 GPU 模式
  });
  renderer.setSize(innerWidth, innerHeight);                 // 設定畫布大小
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));     // 限制高 DPI，避免太重
  renderer.toneMapping = THREE.ACESFilmicToneMapping;        // HDR 色調映射
  document.getElementById('container').appendChild(renderer.domElement); // 插入畫布

  // 建立後處理合成器
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera)); // 基本渲染 pass

  // 加入 UnrealBloomPass 做發光效果
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(innerWidth, innerHeight), // 效果使用的解析度
    CONFIG.bloom.strength,                      // 發光強度
    CONFIG.bloom.radius,                        // 模糊半徑
    CONFIG.bloom.threshold                      // 閾值
  );
  composer.addPass(bloomPass);

  // 產生初始粒子
  createParticles(CONFIG.intro.count);

  // 設定滑鼠 / 觸控互動
  setupMouseInteraction();

  // 啟動動畫 loop
  animate();

  // 進場動畫：先變成 "Shane" 字，再變回球
  setTimeout(() => morphToText('Shane'), 500);      // 0.5 秒後變成 Shane 文字
  setTimeout(() => morphToSphere(), 3000);          // 3 秒後回到球型
//   setTimeout(() => morphToSpherePlanet(), 3000);

  setTimeout(() => transitionToBackground(), CONFIG.intro.duration); // intro 結束進背景

  // Skip 按鈕直接跳背景
  document.getElementById('skip-btn').onclick = transitionToBackground;
}

// 建立粒子幾何與材質
function createParticles(num /* 粒子數量 */) {
  // 如果之前有粒子，先從場景移除
  if (particles) scene.remove(particles);

  const geo = new THREE.BufferGeometry();                   // 粒子幾何
  const pos = new Float32Array(num * 3);                    // 位置 (x,y,z)
  const col = new Float32Array(num * 3);                    // 顏色 (r,g,b)
  const vel = new Float32Array(num * 3);                    // 速度 (vx,vy,vz)

  for (let i = 0; i < num; i++) {
    // 使用近似均勻分布在球面上的演算法
    const phi = Math.acos(-1 + (2 * i) / num);              // 緯度角
    const theta = Math.sqrt(num * Math.PI) * phi;           // 經度角 (漩渦式分布)
    const r = 8;                                            // 球半徑

    // 初始位置：球面附近 + 少許亂數抖動
    pos[i * 3]     = r * Math.cos(theta) * Math.sin(phi) + (Math.random() - 0.5) * 0.5; // x
    pos[i * 3 + 1] = r * Math.sin(theta) * Math.sin(phi) + (Math.random() - 0.5) * 0.5; // y
    pos[i * 3 + 2] = r * Math.cos(phi)                     + (Math.random() - 0.5) * 0.5; // z

    // 初始速度全部 0
    vel[i * 3] = 0;     // vx
    vel[i * 3 + 1] = 0; // vy
    vel[i * 3 + 2] = 0; // vz

    // 顏色：在 base color 附近做亮度隨機
    const b = 0.8 + Math.random() * 0.4; // 亮度倍率
    col[i * 3]     = CONFIG.color.r * CONFIG.colorIntensity * b; // r
    col[i * 3 + 1] = CONFIG.color.g * CONFIG.colorIntensity * b; // g
    col[i * 3 + 2] = CONFIG.color.b * CONFIG.colorIntensity * b; // b
  }

  // 建立 BufferAttributes
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); // itemSize = 3 (x,y,z)
  geo.setAttribute('color',    new THREE.BufferAttribute(col, 3)); // itemSize = 3 (r,g,b)
  geo.setAttribute('velocity', new THREE.BufferAttribute(vel, 3)); // itemSize = 3 (vx,vy,vz)

  // Points 材質 (加色混合 + HDR 感)
  const mat = new THREE.PointsMaterial({
    size: CONFIG.isMobile ? 0.14 : 0.12, // 手機比較大顆一點
    vertexColors: true,                  // 每個粒子使用自己的顏色
    blending: THREE.AdditiveBlending,    // 加色混合，產生發光感
    transparent: true,                   // 允許透明度
    opacity: 0.95,                       // 接近不透明
    sizeAttenuation: true                // 隨距離縮放粒子大小
  });

  // 建立粒子 Points 物件
  particles = new THREE.Points(geo, mat);
  scene.add(particles);

  // 更新全域粒子數
  count = num;
}

// 設定滑鼠與觸控的互動事件
function setupMouseInteraction() {
  // 將 clientX / clientY 轉成 NDC (-1 ~ 1)
  const onMove = (cx /* clientX */, cy /* clientY */) => {
    mouse.x = (cx / innerWidth) * 2 - 1;  // 水平 NDC
    mouse.y = -(cy / innerHeight) * 2 + 1; // 垂直 NDC (注意 Y 軸反向)
    mouse.active = true;                   // 啟用滑鼠影響
  };

  // 滑鼠移動
  addEventListener('mousemove', e => onMove(e.clientX, e.clientY));

  // 觸控移動
  addEventListener(
    'touchmove',
    e => {
      if (e.touches[0]) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true } // 告訴瀏覽器不會阻止 scroll，提升效能
  );

  // 滑鼠離開畫面 / 觸控結束，關閉滑鼠影響
  addEventListener('mouseleave', () => { mouse.active = false; });
  addEventListener('touchend',  () => { mouse.active = false; });

  // 點擊背景粒子區域時觸發文字動畫
  document.getElementById('container').onclick = e => {
    // 只在背景階段，且點到 canvas 才觸發
    // if (phase === 'background' && e.target.tagName === 'CANVAS') {
    //   morphToText('@Shane');              // 變成 @Shane 文字
    //   setTimeout(morphToSphere, 2500);    // 2.5 秒後再變回球
    if (phase === 'background' && e.target.tagName === 'CANVAS') {
        morphToText('@Shane');              // 變成 @Shane 文字
        setTimeout(morphToSpherePlanet, 2500);    // 2.5 秒後再變回球
      }
    // }
  };
}

// 根據滑鼠位置對粒子施加力，並加入回到 targetPositions 的吸附效果
function applyMouseForce() {
  if (!mouse.active || !particles) return;

  const pos = particles.geometry.attributes.position.array;  // 位置陣列
  const vel = particles.geometry.attributes.velocity.array;  // 速度陣列

  // 滑鼠在 3D 空間中的參考位置 (這裡簡單放在 z=0 平面)
  const mv = new THREE.Vector3(
    mouse.x * 15, // x 軸縮放 15，控制影響範圍寬度
    mouse.y * 10, // y 軸縮放 10，控制影響範圍高度
    0             // 固定在 z=0 平面
  );

  for (let i = 0; i < count; i++) {
    const idx = i * 3;

    const dx = pos[idx]     - mv.x;
    const dy = pos[idx + 1] - mv.y;
    const dz = pos[idx + 2] - mv.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz); // 粒子到滑鼠的距離

    // 在滑鼠影響半徑內才施加力
    if (dist < CONFIG.mouse.radius && dist > 0.1) {
      const f = (1 - dist / CONFIG.mouse.radius) * CONFIG.mouse.force; // 距離越近力量越大
      const inv = f / dist; // 先算共用項，避免重複 /dist

      vel[idx]     += dx * inv; // vx 增加
      vel[idx + 1] += dy * inv; // vy 增加
      vel[idx + 2] += dz * inv; // vz 增加
    }

    // 根據速度更新位置
    pos[idx]     += vel[idx];
    pos[idx + 1] += vel[idx + 1];
    pos[idx + 2] += vel[idx + 2];

    // 摩擦減速 (阻尼)
    vel[idx]     *= 0.92;
    vel[idx + 1] *= 0.92;
    vel[idx + 2] *= 0.92;

    // 背景階段：往 targetPositions 做插值，讓形狀穩定
    if (targetPositions && phase === 'background') {
      pos[idx]     += (targetPositions[idx]     - pos[idx])     * 0.02; // x 向目標靠近
      pos[idx + 1] += (targetPositions[idx + 1] - pos[idx + 1]) * 0.02; // y
      pos[idx + 2] += (targetPositions[idx + 2] - pos[idx + 2]) * 0.02; // z
    }
  }

  // 通知 three.js 位置資料已更新，需要重新 upload 到 GPU
  particles.geometry.attributes.position.needsUpdate = true;
}

// 將文字 raster 成點雲座標
function createTextPoints(text /* 要顯示的文字 */) {
  const c = document.createElement('canvas');   // 暫時使用的 2D canvas
  const ctx = c.getContext('2d');               // 2D 繪圖 context
  const fs = 140;                               // 字體大小 (px)

  ctx.font = `bold ${fs}px Arial`;              // 設定字型
  c.width = ctx.measureText(text).width + 40;   // 根據文字寬度動態設定 canvas 寬
  c.height = fs + 40;                           // 高度略大於字體

  // 重新設定繪圖參數 (確保尺寸生效後)
  ctx.fillStyle = 'white';                      // 使用白色文字
  ctx.font = `bold ${fs}px Arial`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';

  // 將文字畫在 canvas 中央
  ctx.fillText(text, c.width / 2, c.height / 2);

  // 取得像素資料
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const pts = [];                               // 收集像素點對應的 3D 座標

  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i]; // R 通道 (因為是白字，RGB 應該接近 255)

    // 如果 R 值夠亮，且隨機取樣 (0.3 機率取樣，避免點太密)
    if (r > 128 && Math.random() < 0.3) {
      const pixelIndex = i / 4;
      const x = pixelIndex % c.width;
      const y = Math.floor(pixelIndex / c.width);

      // 將像素座標轉成 3D 空間座標（縮放至合理文字大小）
      pts.push({
        x: (x - c.width / 2) / (fs / 14),  // 平移到中心，縮放
        y: -(y - c.height / 2) / (fs / 14) // Canvas Y 向下，故取負號
      });
    }
  }

  return pts; // 回傳 2D 點陣列，之後 Z 會另行加亂數
}

// 粒子 Morph 成文字形狀
function morphToText(text /* 要顯示的文字 */) {
  const tp = createTextPoints(text);                     // 文字點陣列
  const pos = particles.geometry.attributes.position.array;

  // 將整顆粒子球慢慢旋正
  gsap.to(particles.rotation, { x: 0, y: 0, z: 0, duration: 0.8 });

  for (let i = 0; i < count; i++) {
    const idx = i * 3;

    let tx; // 目標 x
    let ty; // 目標 y
    let tz; // 目標 z

    if (i < tp.length) {
      // 前面一批粒子直接對應到文字點
      tx = tp[i].x;
      ty = tp[i].y;
      tz = (Math.random() - 0.5) * 2; // Z 給一點深度亂數
    } else {
      // 多出來的粒子放到外圍，避免全部擠在文字上
      const a = Math.random() * Math.PI * 2; // 隨機角度
      const r = 20 + Math.random() * 15;     // 隨機半徑
      tx = Math.cos(a) * r;
      ty = Math.sin(a) * r;
      tz = (Math.random() - 0.5) * 20;
    }

    // 使用 GSAP tween 更新 Buffer 中的指定 index
    gsap.to(pos, {
      [idx]:     tx, // 目標 x
      [idx + 1]: ty, // 目標 y
      [idx + 2]: tz, // 目標 z
      duration: 1.5,
      ease: 'power3.out',
      onUpdate: () => {
        particles.geometry.attributes.position.needsUpdate = true;
      }
    });
  }
}

// 粒子 Morph 成球體 (背景狀態也會用到)
function morphToSphere() {
  const pos = particles.geometry.attributes.position.array;
  targetPositions = new Float32Array(count * 3); // 儲存每顆粒子目標位置

  for (let i = 0; i < count; i++) {
    const idx = i * 3;

    // 與 createParticles 類似的球面分布
    const phi = Math.acos(-1 + (2 * i) / count);
    const theta = Math.sqrt(count * Math.PI) * phi;
    const r = 8; // 球半徑

    const tx = r * Math.cos(theta) * Math.sin(phi) + (Math.random() - 0.5) * 0.5;
    const ty = r * Math.sin(theta) * Math.sin(phi) + (Math.random() - 0.5) * 0.5;
    const tz = r * Math.cos(phi)                     + (Math.random() - 0.5) * 0.5;

    targetPositions[idx]     = tx;
    targetPositions[idx + 1] = ty;
    targetPositions[idx + 2] = tz;

    gsap.to(pos, {
      [idx]:     tx,
      [idx + 1]: ty,
      [idx + 2]: tz,
      duration: 1.5,
      ease: 'power2.inOut',
      onUpdate: () => {
        particles.geometry.attributes.position.needsUpdate = true;
      }
    });
  }
}

// 粒子 Morph 成「星球 + 星環」形狀
function morphToSpherePlanet() {
    const pos = particles.geometry.attributes.position.array;
    targetPositions = new Float32Array(count * 3); // 儲存每顆粒子目標位置
  
    const planetRatio = 0.7;                 // 多少比例粒子做星球 (0~1)
    const planetCount = Math.floor(count * planetRatio);
    const ringCount = count - planetCount;   // 剩下的做星環
  
    const planetRadius = 6;                  // 星球半徑
    const ringInner = 7.5;                   // 星環內半徑
    const ringOuter = 11;                    // 星環外半徑
    const ringThickness = 0.6;               // 星環厚度 (Y 方向)
  
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
  
      let tx, ty, tz;
  
      if (i < planetCount) {
        // ===== 星球本體：仍然用球面分布 =====
        const phi = Math.acos(-1 + (2 * i) / planetCount);      // 緯度角
        const theta = Math.sqrt(planetCount * Math.PI) * phi;   // 經度角
        const r = planetRadius + (Math.random() - 0.5) * 0.3;   // 半徑 + 微抖動
  
        tx = r * Math.cos(theta) * Math.sin(phi);
        ty = r * Math.sin(theta) * Math.sin(phi);
        tz = r * Math.cos(phi);
      } else {
        // ===== 星環：放在一個扁平的環形上 (類似土星環) =====
        const j = i - planetCount;               // 星環粒子索引 0 ~ ringCount-1
        const t = (j / ringCount) * Math.PI * 2; // 角度 (0~2π)
  
        // 在 ringInner ~ ringOuter 之間插值
        const baseR = ringInner + Math.random() * (ringOuter - ringInner);
  
        tx = baseR * Math.cos(t);                         // 在 XZ 平面形成環
        tz = baseR * Math.sin(t);
        ty = (Math.random() - 0.5) * ringThickness;       // 環的厚度：上下微小亂數
  
        // 讓星環稍微傾斜一點 (繞 X 軸轉)
        const tilt = 0.35;                                // 傾斜角度（弧度）
        const cosT = Math.cos(tilt);
        const sinT = Math.sin(tilt);
        const ty2 = ty * cosT - tz * sinT;
        const tz2 = ty * sinT + tz * cosT;
        ty = ty2;
        tz = tz2;
      }
  
      targetPositions[idx]     = tx;
      targetPositions[idx + 1] = ty;
      targetPositions[idx + 2] = tz;
  
      // 用 GSAP 做平滑 morph
      gsap.to(pos, {
        [idx]:     tx,
        [idx + 1]: ty,
        [idx + 2]: tz,
        duration: 1.5,
        ease: 'power2.inOut',
        onUpdate: () => {
          particles.geometry.attributes.position.needsUpdate = true;
        }
      });
    }
  }
  

// 從進場動畫切換到背景常駐狀態
function transitionToBackground() {
  if (introComplete) return; // 避免重複執行
  introComplete = true;

  const skipBtn = document.getElementById('skip-btn');
  skipBtn.classList.add('hidden'); // 隱藏 Skip 按鈕

  const cont = document.getElementById('container');

  // 將粒子縮小、往後移，給主內容更多空間
  gsap.to(particles.scale, {
    x: 0.4,
    y: 0.4,
    z: 0.4,
    duration: 1.2,
    ease: 'power2.inOut'
  });

  gsap.to(particles.position, {
    y: -5,   // 往下移
    z: -20,  // 往後拉
    duration: 1.2,
    ease: 'power2.inOut'
  });

  // Bloom 稍微收斂，避免過亮
  gsap.to(bloomPass, { strength: 0.7, duration: 1 });

  // 等縮放移動動畫差不多後，切換為背景模式
  setTimeout(() => {
    cont.classList.add('background');           // 給 container 加上背景 class (CSS 用)

    createParticles(CONFIG.background.count);   // 重新建立較少顆粒子的背景場景
    particles.scale.set(0.5, 0.5, 0.5);         // 背景粒子縮小一點
    particles.position.set(0, -3, -15);         // 放在畫面下方與內部
    // morphToSphere();                            // 變為球型雲
    morphToSpherePlanet();


    // 顯示滑鼠互動提示
    const hint = document.getElementById('hint');
    hint.classList.add('show');
    setTimeout(() => hint.classList.remove('show'), 4000); // 4 秒後隱藏提示
  }, 1200);

  // 主內容淡入
  setTimeout(() => {
    document.getElementById('main-content').classList.add('visible');
  }, 800);

  // 更新狀態為背景
  phase = 'background';
}

// 每幀的動畫 loop
function animate() {
  requestAnimationFrame(animate); // 要求下一幀

  if (phase === 'intro') {
    // 進場時旋轉快一點
    particles.rotation.y += 0.003;
  } else {
    // 背景狀態旋轉較慢，並啟用滑鼠力場
    particles.rotation.y += 0.0005;
    particles.rotation.x += 0.0005;
    applyMouseForce();
  }

  // 使用 composer 進行後處理渲染
  composer.render();
}

// 視窗尺寸改變時，更新相機與 renderer
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; // 更新畫面比例
  camera.updateProjectionMatrix();          // 重新計算投影矩陣
  renderer.setSize(innerWidth, innerHeight);      // 更新 renderer 大小
  composer.setSize(innerWidth, innerHeight);      // 更新後處理解析度
});

init();