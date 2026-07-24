(function () {
  var cfg = window.CRIS_CEO_CLUB || {};
  var STORAGE_KEY = cfg.storageKey || 'cris_ceo_club_saved_cart';
  var DISCOUNT_PERCENT = Number(cfg.discountPercent) || 7;
  var JOIN_URL = cfg.joinUrl || '/products/cris-method';
  var MEMBERSHIP_TYPE = (cfg.membershipType || 'subscription').toLowerCase();
  var GIFT_PRODUCT_ID = cfg.giftProductId ? String(cfg.giftProductId) : '';
  var MONEY_FORMAT = cfg.moneyFormat || '${{amount}}';
  var IS_MEMBER = !!cfg.isMember;

  function formatMoney(cents) {
    var amount = (Math.max(0, cents) / 100).toFixed(2);
    if (typeof Shopify !== 'undefined' && typeof Shopify.formatMoney === 'function') {
      try {
        return Shopify.formatMoney(cents, MONEY_FORMAT);
      } catch (e) {}
    }
    return MONEY_FORMAT.replace(/\{\{\s*amount\s*\}\}/, amount)
      .replace(/\{\{\s*amount_no_decimals\s*\}\}/, String(Math.round(cents / 100)))
      .replace(/\{\{\s*amount_with_comma_separator\s*\}\}/, amount.replace('.', ','));
  }

  function isMembershipItem(item) {
    return ((item.product_type || '') + '').toLowerCase().trim() === MEMBERSHIP_TYPE;
  }

  function isGiftItem(item) {
    if (!item) return false;
    if (GIFT_PRODUCT_ID && String(item.product_id) === GIFT_PRODUCT_ID) return true;
    return !!(item.properties && (item.properties._gift || item.properties.__shopify_send_gift_card_to_recipient));
  }

  function isEligibleItem(item) {
    if (!item || isMembershipItem(item) || isGiftItem(item)) return false;
    return true;
  }

  function cartHasMembership(cart) {
    return (cart.items || []).some(isMembershipItem);
  }

  function eligibleSubtotal(cart) {
    return (cart.items || []).reduce(function (sum, item) {
      return isEligibleItem(item) ? sum + item.final_line_price : sum;
    }, 0);
  }

  function calcSavings(cart) {
    return Math.round(eligibleSubtotal(cart) * (DISCOUNT_PERCENT / 100));
  }

  function getSavedCart() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !Array.isArray(data.items) || !data.items.length) return null;
      return data;
    } catch (e) {
      return null;
    }
  }

  function setSavedCart(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function clearSavedCart() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function fetchCart() {
    return fetch('/cart.js', { credentials: 'same-origin' }).then(function (r) {
      return r.json();
    });
  }

  function clearCart() {
    return fetch('/cart/clear.js', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    }).then(function (r) {
      return r.json();
    });
  }

  function addItems(items) {
    return fetch('/cart/add.js', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ items: items })
    }).then(function (r) {
      return r.json();
    });
  }

  function refreshThemeCart() {
    document.dispatchEvent(new CustomEvent('cart:refresh'));
    if (window.T4SThemeSP && T4SThemeSP.Cart && typeof T4SThemeSP.Cart.getCart === 'function') {
      try {
        T4SThemeSP.Cart.getCart();
      } catch (e) {}
    }
  }

  function serializeItems(cart) {
    return (cart.items || [])
      .filter(isEligibleItem)
      .map(function (item) {
        return {
          id: item.variant_id,
          quantity: item.quantity,
          properties: item.properties || {},
          title: item.product_title || item.title,
          price: item.final_line_price
        };
      });
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = !!hidden;
  }

  function updateBanners(cart) {
    var savings = calcSavings(cart);
    var hasEligible = savings > 0;
    var saved = getSavedCart();
    var hasSaved = !!(saved && saved.items && saved.items.length);
    var hasMembership = cartHasMembership(cart);
    var roots = document.querySelectorAll('[data-ceo-club-savings]');

    roots.forEach(function (root) {
      var savingsEl = root.querySelector('[data-ceo-savings-amount]');
      var joinBtn = root.querySelector('[data-ceo-join]');
      var checkoutBtn = root.querySelector('[data-ceo-checkout-btn]');
      var restoreBtn = root.querySelector('[data-ceo-restore]');
      var pendingEl = root.querySelector('[data-ceo-pending]');
      var checkoutEl = root.querySelector('[data-ceo-checkout]');
      var offerEl = root.querySelector('[data-ceo-offer]');

      // Member with saved products → restore only
      if (IS_MEMBER && hasSaved) {
        root.hidden = false;
        setHidden(offerEl, true);
        setHidden(pendingEl, true);
        setHidden(checkoutEl, false);
        if (checkoutEl) {
          checkoutEl.querySelector('.ceo-club-savings__title').textContent = 'Welcome to the CEO Club';
          checkoutEl.querySelector('.ceo-club-savings__text').textContent =
            'Restore your saved products to continue shopping with your 7% member perk.';
        }
        setHidden(joinBtn, true);
        setHidden(checkoutBtn, true);
        setHidden(restoreBtn, false);
        return;
      }

      if (IS_MEMBER) {
        root.hidden = true;
        return;
      }

      // Saved products + membership already in cart → checkout membership only
      if (hasSaved && hasMembership) {
        root.hidden = false;
        setHidden(offerEl, true);
        setHidden(pendingEl, true);
        setHidden(checkoutEl, false);
        setHidden(joinBtn, true);
        setHidden(checkoutBtn, false);
        setHidden(restoreBtn, true);
        return;
      }

      // Saved products, waiting to add membership
      if (hasSaved) {
        root.hidden = false;
        setHidden(offerEl, true);
        setHidden(pendingEl, false);
        setHidden(checkoutEl, true);
        setHidden(joinBtn, false);
        if (joinBtn) joinBtn.textContent = 'Continue to membership';
        setHidden(checkoutBtn, true);
        setHidden(restoreBtn, false);
        return;
      }

      // Normal offer for carts with products
      if (!hasEligible) {
        root.hidden = true;
        return;
      }

      root.hidden = false;
      setHidden(offerEl, false);
      setHidden(pendingEl, true);
      setHidden(checkoutEl, true);
      setHidden(joinBtn, false);
      if (joinBtn) joinBtn.textContent = 'Join CEO Club & save';
      setHidden(checkoutBtn, true);
      setHidden(restoreBtn, true);
      if (savingsEl) savingsEl.textContent = formatMoney(savings);
    });
  }

  async function handleJoin(btn) {
    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    }
    try {
      var cart = await fetchCart();
      var items = serializeItems(cart);

      // Already saved earlier — just continue to membership product
      if (!items.length && getSavedCart()) {
        window.location.href = JOIN_URL;
        return;
      }

      if (!items.length) {
        window.location.href = JOIN_URL;
        return;
      }

      setSavedCart({
        items: items,
        savedAt: Date.now(),
        estimatedSavings: calcSavings(cart),
        discountPercent: DISCOUNT_PERCENT
      });
      await clearCart();
      refreshThemeCart();
      window.location.href = JOIN_URL;
    } catch (err) {
      console.error('[CEO Club] join failed', err);
      alert('Something went wrong saving your cart. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    }
  }

  async function handleRestore(btn) {
    var saved = getSavedCart();
    if (!saved || !saved.items.length) return;

    var cart = await fetchCart();
    if (cartHasMembership(cart) && !IS_MEMBER) {
      alert('Please checkout the CEO Club membership first. Restoring products now would remove membership from your cart.');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
    }

    try {
      var payload = saved.items.map(function (item) {
        var row = { id: item.id, quantity: item.quantity };
        if (item.properties && Object.keys(item.properties).length) {
          row.properties = item.properties;
        }
        return row;
      });
      var result = await addItems(payload);
      if (result && result.status && result.description) {
        throw new Error(result.description);
      }
      clearSavedCart();
      refreshThemeCart();
      if (window.location.pathname.indexOf('/cart') !== -1) {
        window.location.reload();
      } else {
        updateBanners(await fetchCart());
        alert('Your saved items have been restored to your cart.');
      }
    } catch (err) {
      console.error('[CEO Club] restore failed', err);
      alert(err.message || 'Could not restore your saved items. Please try again.');
      if (btn) {
        btn.disabled = false;
        btn.removeAttribute('aria-busy');
      }
    }
  }

  function bindEvents() {
    document.addEventListener('click', function (e) {
      var joinBtn = e.target.closest('[data-ceo-join]');
      if (joinBtn) {
        e.preventDefault();
        handleJoin(joinBtn);
        return;
      }
      var checkoutBtn = e.target.closest('[data-ceo-checkout-btn]');
      if (checkoutBtn) {
        e.preventDefault();
        window.location.href = '/checkout';
        return;
      }
      var restoreBtn = e.target.closest('[data-ceo-restore]');
      if (restoreBtn) {
        e.preventDefault();
        handleRestore(restoreBtn);
      }
    });

    document.addEventListener('cart:updated', function () {
      fetchCart().then(updateBanners).catch(function () {});
    });
    document.addEventListener('cart:refresh', function () {
      setTimeout(function () {
        fetchCart().then(updateBanners).catch(function () {});
      }, 300);
    });
  }

  async function maybeAutoRestore() {
    if (!IS_MEMBER) return;
    var saved = getSavedCart();
    if (!saved || !saved.items.length) return;
    try {
      var cart = await fetchCart();
      if (!cartHasMembership(cart) && serializeItems(cart).length === 0) {
        await handleRestore(null);
      }
    } catch (e) {
      console.error('[CEO Club] auto-restore skipped', e);
    }
  }

  function init() {
    bindEvents();
    fetchCart()
      .then(function (cart) {
        updateBanners(cart);
        return maybeAutoRestore();
      })
      .catch(function (err) {
        console.error('[CEO Club] init failed', err);
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
