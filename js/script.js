window.addEventListener('scroll', () => {
  const header = document.querySelector('header');

  if(header && window.scrollY > 40) {
    header.style.background = 'rgba(9,9,11,0.98)';
  } else if(header) {
    header.style.background = 'rgba(9,9,11,0.92)';
  }
});
