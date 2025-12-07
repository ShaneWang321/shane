// avatar 大頭貼點擊開啟 overlay
document.getElementById('avatarBtn').onclick = () => {
    document.getElementById('overlay').classList.add('open');
  };
  
  // 點 overlay 任意處關閉
  document.getElementById('overlay').onclick = () => {
    document.getElementById('overlay').classList.remove('open');
  };
  
  // 卡片 3D hover
  document.querySelectorAll('.card.glass').forEach(card => {
    card.onmousemove = e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        `translateY(-4px) scale(1.01) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
    };
  
    card.onmouseleave = () => {
      card.style.transform = '';
    };
  });
  