
const ON_CHANGE_DEBOUNCE_TIMER = 300;

class BulkAdd extends HTMLElement {
  constructor() {
    super();
    // console.log("init  BulkAdd");
    this.queue = [];
    this.requestStarted = false;
    this.ids = [];
  }

  startQueue(id, quantity) {
    // console.log(quantity);
    this.queue.push({ id, quantity });
    const interval = setInterval(() => {
      if (this.queue.length > 0) {
        if (!this.requestStarted) {
          this.sendRequest(this.queue);
        }
      } else {
        clearInterval(interval);
      }
    }, 250);
  }

  sendRequest(queue) {
    this.requestStarted = true;
    const items = {};
    queue.forEach((queueItem) => {
      items[parseInt(queueItem.id)] = queueItem.quantity;
    });
    this.queue = this.queue.filter((queueElement) => !queue.includes(queueElement));
    const quickBulkElement = this.closest('quick-order-list') || this.closest('quick-add-bulk');
    quickBulkElement.updateMultipleQty(items);
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    input.value = input.getAttribute('value');
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    event.target.setCustomValidity(message);
    event.target.reportValidity();
    this.resetQuantityInput(index);
    event.target.select();
  }

  validateQuantity(event) {
    const inputValue = parseInt(event.target.value);
    const index = event.target.dataset.index;

    if (inputValue < event.target.dataset.min) {
      this.setValidity(event, index, window.quickOrderListStrings.min_error.replace('[min]', event.target.dataset.min));
    } else if (inputValue > parseInt(event.target.max)) {
      T4SThemeSP.Notices(T4Sstrings.notice_stock_msg.replace('[max]', parseInt(event.target.max)));
    } else if (inputValue % parseInt(event.target.step) != 0) {
      this.setValidity(event, index, window.quickOrderListStrings.step_error.replace('[step]', event.target.step));
    } else {
      event.target.setCustomValidity('');
      event.target.reportValidity();
      this.startQueue(index, inputValue);
    }
  }

  getSectionsUrl() {
    if (window.pageNumber) {
      return `${window.location.pathname}?page=${window.pageNumber}`;
    } else {
      return `${window.location.pathname}`;
    }
  }

  getSectionInnerHTML(html, selector) {
    // console.log(new DOMParser().parseFromString(html, 'text/html'));
    return new DOMParser().parseFromString(html, 'text/html').querySelector(selector).innerHTML;
  }
}
class QuantityInput extends HTMLElement {
  constructor() {
    super();
    this.input = this.querySelector('input');
    this.changeEvent = new Event('change', { bubbles: true });
    this.input.addEventListener('change', this.onInputChange.bind(this));
    this.querySelectorAll('button').forEach((button) =>
      button.addEventListener('click', this.onButtonClick.bind(this))
    );
  }

  quantityUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.validateQtyRules();
    // this.quantityUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.quantityUpdate, this.validateQtyRules.bind(this));
  }

  disconnectedCallback() {
    // if (this.quantityUpdateUnsubscriber) {
    //   this.quantityUpdateUnsubscriber();
    // }
  }

  onInputChange(event) {
    // console.log("change");
    this.validateQtyRules();
  }

  onButtonClick(event) {
    event.preventDefault();
    const previousValue = this.input.value;

    if (event.target.name === 'plus') {
      if (parseInt(this.input.dataset.min) > parseInt(this.input.step) && this.input.value == 0) {
        this.input.value = this.input.dataset.min;
      } else {
        this.input.stepUp();
      }
    } else {
      this.input.stepDown();
    }
    
    if (previousValue !== this.input.value) this.input.dispatchEvent(this.changeEvent);

    if (this.input.dataset.min === previousValue && event.target.name === 'minus') {
      this.input.value = parseInt(this.input.min);
    }
  }

  validateQtyRules() {
    
    const value = parseInt(this.input.value);
    const current_value = parseInt(this.input.dataset.currentValue);
    // console.log(this.input.min);
    if (this.input.min != undefined) {
      const buttonMinus = this.querySelector("button[name='minus']");
      value <= parseInt(this.input.min) ? buttonMinus.setAttribute('disabled', '') : buttonMinus.removeAttribute('disabled');
    }
    if (this.input.max) {
      const max = parseInt(this.input.max);
      const buttonPlus = this.querySelector("button[name='plus']");
      value >= max ? buttonPlus.setAttribute('disabled', '') : buttonPlus.removeAttribute('disabled');
    }

    if(value > parseInt(this.input.max)){
      this.input.value = parseInt(this.input.max);
      T4SThemeSP.Notices(T4Sstrings.notice_stock_msg.replace('[max]', parseInt(this.input.max)));
      // return;
    }

    if(!value) {
      this.input.value = current_value;
      return;
    }
    value < parseInt(this.input.min) ? this.input.value = current_value : this.input.setAttribute('data-current-value', value);
    // console.log(value);

    
  }
}
customElements.define('quantity-input', QuantityInput);

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

function throttle(fn, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = new Date().getTime();
    if (now - lastCall < delay) {
      return;
    }
    lastCall = now;
    return fn(...args);
  };
}

function fetchConfig(type = 'json') {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: `application/${type}` },
  };
}

customElements.define(
  'quick-order-list-remove-button',
  class QuickOrderListRemoveButton extends BulkAdd {
    constructor() {
      super();
      this.addEventListener('click', (event) => {
        event.preventDefault();
        this.startQueue(this.dataset.index, 0);
      });
    }
  }
);

customElements.define(
  'quick-order-list-remove-all-button',
  class QuickOrderListRemoveAllButton extends HTMLElement {
    constructor() {
      super();
      this.quickOrderList = this.closest('quick-order-list');
      const allVariants = this.quickOrderList.querySelectorAll('[data-quantity-variant-id]');
      const items = {};
      let hasVariantsInCart = false;

      allVariants.forEach((variant) => {
        const cartQty = parseInt(variant.dataset.cartQuantity);
        if (cartQty > 0) {
          hasVariantsInCart = true;
          items[parseInt(variant.dataset.quantityVariantId)] = 0;
        }
      });

      if (!hasVariantsInCart) {
        this.classList.add('hidden');
      }

      this.addEventListener('click', (event) => {
        event.preventDefault();
        this.quickOrderList.updateMultipleQty(items);
      });
    }

  }
);
class QuickOrderList extends BulkAdd {
  constructor() {
    super();
    // console.log("init quick order list");
    this.cart = document.querySelector('#t4s-mini_cart');
    this.quickOrderListId = `${this.dataset.section}-${this.dataset.productId}`;
    this.defineInputsAndQuickOrderTable();

    const form = this.querySelector('form');

    this.getTableHead();

    const pageParams = new URLSearchParams(window.location.search);
    window.pageNumber = decodeURIComponent(pageParams.get('page') || '');
    form.addEventListener('submit', this.onSubmit.bind(this));
    this.addMultipleDebounce();
  }

  cartUpdateUnsubscriber = undefined;

  onSubmit(event) {
    event.preventDefault();
  }

  connectedCallback() {

    // this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
    //   const variantIds = [];
    //   this.querySelectorAll('.variant-item').forEach((item) => {
    //     variantIds.push(parseInt(item.dataset.variantId));
    //   });
    //   if (
    //     event.source === this.quickOrderListId ||
    //     !event.cartData.items?.some((element) => variantIds.includes(element.variant_id))
    //   ) {
    //     return;
    //   }
    //   // If its another section that made the update
    //   this.refresh().then(() => {
    //     this.defineInputsAndQuickOrderTable();
    //     this.addMultipleDebounce();
    //   });
    // });
    this.sectionId = this.dataset.section;
  }

  disconnectedCallback() {
    this.cartUpdateUnsubscriber?.();
  }

  defineInputsAndQuickOrderTable() {
    this.allInputsArray = Array.from(this.querySelectorAll('input[type="number"]'));
    // this.quickOrderListTable = this.querySelector('.t4s-quick-order-list__table');
    // this.quickOrderListTable.addEventListener('focusin', this.switchVariants.bind(this));
  }

  onChange(event) {
    const inputValue = parseInt(event.target.value);
    this.cleanErrorMessageOnType(event);
    if (inputValue == 0) {
      this.startQueue(event.target.dataset.index, inputValue);
    } else {
      this.validateQuantity(event);
    }
  }

  cleanErrorMessageOnType(event) {
    event.target.addEventListener('keydown', () => {
      event.target.setCustomValidity(' ');
      event.target.reportValidity();
    });
  }

  validateInput(target) {
    if (target.max) {
      return (
        parseInt(target.value) == 0 ||
        (parseInt(target.value) >= parseInt(target.dataset.min) &&
          parseInt(target.value) <= parseInt(target.max) &&
          parseInt(target.value) % parseInt(target.step) == 0)
      );
    } else {
      return (
        parseInt(target.value) == 0 ||
        (parseInt(target.value) >= parseInt(target.dataset.min) &&
          parseInt(target.value) % parseInt(target.step) == 0)
      );
    }
  }

  refresh() {
    return new Promise((resolve, reject) => {
      fetch(`${this.getSectionsUrl()}?section_id=${this.sectionId}`)
        .then((response) => response.text())
        .then((responseText) => {
          const html = new DOMParser().parseFromString(responseText, 'text/html');
          const sourceQty = html.querySelector(`#${this.quickOrderListId}`);
          if (sourceQty) {
            this.innerHTML = sourceQty.innerHTML;
          }
          resolve();
        })
        .catch((e) => {
          console.error(e);
          reject(e);
        });
    });
  }

  getSectionsToRender() {
    return [
      {
        id: this.quickOrderListId,
        section: document.getElementById(this.quickOrderListId).dataset.section,
        selector: `#${this.quickOrderListId} .t4s-quick-order-list-content`,
      },
      {
        id: `t4s-quick-order-list-total-${this.dataset.productId}-${this.dataset.section}`,
        section: document.getElementById(this.quickOrderListId).dataset.section,
        selector: `#${this.quickOrderListId} .t4s-quick-order-list__total`,
      },
    ];
  }

  addMultipleDebounce() {
    this.querySelectorAll('quantity-input').forEach((qty) => {
      const debouncedOnChange = debounce((event) => {
        this.onChange(event);
      }, ON_CHANGE_DEBOUNCE_TIMER);
      qty.addEventListener('change', debouncedOnChange.bind(this));
    });
  }

  renderSections(parsedState, ids) {
    this.ids.push(ids);
    // console.log(parsedState)
    const intersection = this.queue.filter((element) => ids.includes(element.id));
    if (intersection.length !== 0) return;

    this.getSectionsToRender().forEach((section) => {
      const sectionElement = document.getElementById(section.id);
      if (
        sectionElement &&
        sectionElement.parentElement &&
        sectionElement.parentElement.classList.contains('t4s-drawer')
      ) {
        parsedState.items.length > 0
          ? sectionElement.parentElement.classList.remove('is-empty')
          : sectionElement.parentElement.classList.add('is-empty');
        setTimeout(() => {
          // document.querySelector('#CartDrawer-Overlay').addEventListener('click', this.cart.close.bind(this.cart));
        });
      }
      const elementToReplace =
        sectionElement && sectionElement.querySelector(section.selector)
          ? sectionElement.querySelector(section.selector)
          : sectionElement;
      if (elementToReplace) {
        if (section.selector === `#${this.quickOrderListId} .t4s-quick-order-list-content` && this.ids.length > 0) {
          this.ids.flat().forEach((i) => {
            elementToReplace.querySelector(`#Variant-${i}`).innerHTML = this.getSectionInnerHTML(
              parsedState.sections[section.section],
              `#Variant-${i}`
            );
          });
        } else {
          elementToReplace.innerHTML = this.getSectionInnerHTML(
            parsedState.sections[section.section],
            section.selector
          );
        }
      }
    });
    this.defineInputsAndQuickOrderTable();
    this.addMultipleDebounce();
    this.ids = [];
  }

  getTableHead() {
    return document.querySelector('.t4s-quick-order-list__table thead');
  }

  switchVariants(event) {
    if (event.target.tagName !== 'INPUT') {
      return;
    }

    this.variantListInput = event.target;
    this.variantListInput.select();
    if (this.allInputsArray.length !== 1) {
      this.variantListInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
          if (this.validateInput(e.target)) {
            const currentIndex = this.allInputsArray.indexOf(e.target);
            this.lastKey = e.shiftKey;
            if (!e.shiftKey) {
              const nextIndex = currentIndex + 1;
              const nextVariant = this.allInputsArray[nextIndex] || this.allInputsArray[0];
              nextVariant.select();
            } else {
              const previousIndex = currentIndex - 1;
              const previousVariant =
                this.allInputsArray[previousIndex] || this.allInputsArray[this.allInputsArray.length - 1];
              this.lastElement = previousVariant.dataset.index;
              previousVariant.select();
            }
          }
        }
      });

      this.scrollQuickOrderListTable();
    } else {
      this.variantListInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.target.blur();
        }
      });
    }
  }

  updateMultipleQty(items) {
    // this.querySelector('.variant-remove-total .loading__spinner')?.classList.remove('hidden');
    const ids = Object.keys(items);

    const body = JSON.stringify({
      updates: items,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: this.dataset.url,
    });
    // this.updateMessage();
    // this.setErrorMessage();
    // console.log("Start");
    this.setAttribute('aria-busy',true)
    fetch(`${T4Sroutes.cart_update_url}`, { ...fetchConfig(), ...{ body } })
      .then((response) => {
        return response.text();
      })
      .then((state) => {
        const parsedState = JSON.parse(state);
        this.renderSections(parsedState, ids);
        document.dispatchEvent(new CustomEvent('cart:refresh'));
        // console.log("End => Done then");
        // publish(PUB_SUB_EVENTS.cartUpdate, { source: this.quickOrderListId, cartData: parsedState });
      })
      .catch((error) => {
        // this.setErrorMessage(window.cartStrings.error);
        console.log(error);
        // console.log("End 2 => Error");
      })
      .finally(() => {
        // this.querySelector('.variant-remove-total .loading__spinner')?.classList.add('hidden');
        this.requestStarted = false;
        // console.log("End 3 => Finally!");
        this.setAttribute('aria-busy',false)
      });
  }
  setErrorMessage(message = null) {
    this.errorMessageTemplate =
      this.errorMessageTemplate ??
      document.getElementById(`QuickOrderListErrorTemplate-${this.dataset.productId}`).cloneNode(true);
    const errorElements = document.querySelectorAll('.t4s-quick-order-list-error');

    errorElements.forEach((errorElement) => {
      errorElement.innerHTML = '';
      if (!message) return;
      const updatedMessageElement = this.errorMessageTemplate.cloneNode(true);
      updatedMessageElement.content.querySelector('.t4s-quick-order-list-error-message').innerText = message;
      errorElement.appendChild(updatedMessageElement.content);
    });
  }

  updateMessage(quantity = null) {
    const messages = this.querySelectorAll('.t4s-quick-order-list__message-text');
    const icons = this.querySelectorAll('.t4s-quick-order-list__message-icon');

    if (quantity === null || isNaN(quantity)) {
      messages.forEach((message) => (message.innerHTML = ''));
      icons.forEach((icon) => icon.classList.add('hidden'));
      return;
    }

    const isQuantityNegative = quantity < 0;
    const absQuantity = Math.abs(quantity);

    const textTemplate = isQuantityNegative
      ? absQuantity === 1
        ? window.quickOrderListStrings.itemRemoved
        : window.quickOrderListStrings.itemsRemoved
      : quantity === 1
      ? window.quickOrderListStrings.itemAdded
      : window.quickOrderListStrings.itemsAdded;

    messages.forEach((msg) => (msg.innerHTML = textTemplate.replace('[quantity]', absQuantity)));

    if (!isQuantityNegative) {
      icons.forEach((i) => i.classList.remove('hidden'));
    }
  }

  updateError(updatedValue, id) {
    let message = '';
    if (typeof updatedValue === 'undefined') {
      message = window.cartStrings.error;
    } else {
      message = window.cartStrings.quantityError.replace('[quantity]', updatedValue);
    }
    this.updateLiveRegions(id, message);
  }

  cleanErrors(id) {
    // this.querySelectorAll('.desktop-row-error').forEach((error) => error.classList.add('hidden'));
    // this.querySelectorAll(`.variant-item__error-text`).forEach((error) => error.innerHTML = '');
  }

  updateLiveRegions(id, message) {
    const variantItemErrorDesktop = document.getElementById(`Quick-order-list-item-error-desktop-${id}`);
    const variantItemErrorMobile = document.getElementById(`Quick-order-list-item-error-mobile-${id}`);
    if (variantItemErrorDesktop) {
      variantItemErrorDesktop.querySelector('.variant-item__error-text').innerHTML = message;
      variantItemErrorDesktop.closest('tr').classList.remove('hidden');
    }
    if (variantItemErrorMobile)
      variantItemErrorMobile.querySelector('.variant-item__error-text').innerHTML = message;

    this.variantItemStatusElement.setAttribute('aria-hidden', true);

    const cartStatus = document.getElementById('quick-order-list-live-region-text');
    cartStatus.setAttribute('aria-hidden', false);

    setTimeout(() => {
      cartStatus.setAttribute('aria-hidden', true);
    }, 1000);
  }

  toggleLoading(id, enable) {
    const quickOrderListItems = this.querySelectorAll(`#Variant-${id} .loading__spinner`);
    const quickOrderListItem = this.querySelector(`#Variant-${id}`);

    if (enable) {
      quickOrderListItem.classList.add('quick-order-list__container--disabled');
      [...quickOrderListItems].forEach((overlay) => overlay.classList.remove('hidden'));
      this.variantItemStatusElement.setAttribute('aria-hidden', false);
    } else {
      quickOrderListItem.classList.remove('quick-order-list__container--disabled');
      quickOrderListItems.forEach((overlay) => overlay.classList.add('hidden'));
    }
  }
}
customElements.define('quick-order-list',QuickOrderList);

