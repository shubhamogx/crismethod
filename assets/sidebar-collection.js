class SidebarIcon extends HTMLElement{
    constructor(){
      super();
      this.parent = this.closest('li.t4s-cat-item');
      this.id_content = this.getAttribute('aria-controls');
      this.svg = this.querySelector('svg');
      this.control = this.parent.querySelector(`#${this.id_content}`);
      this.addEventListener('click', () => {
        this.Open ? this.closeContent() : this.openContent();
      })
    }
    get Open(){
      return this.hasAttribute('open')
    }
    static observedAttributes = ["open"]
    openContent(){
      
      this.control.style.setProperty('display', "block");
      this.svg.classList.add('rotated');
      this.setAttribute('open', '');
    }
    closeContent(){
      this.control.style.setProperty('display', "none");
      this.svg.classList.remove('rotated');
      this.removeAttribute('open');
    }
  }
  customElements.define('sidebar-icon', SidebarIcon);