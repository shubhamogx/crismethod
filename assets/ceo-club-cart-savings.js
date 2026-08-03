(function () {
  var cfg = window.CRIS_CEO_CLUB || {};
  var DISCOUNT_PERCENT = Number(cfg.discountPercent) || 7;
  var MEMBERSHIP_TYPE = (cfg.membershipType || 'subscription').toLowerCase();
  var MEMBERSHIP_VARIANT_ID = cfg.membershipVariantId ? Number(cfg.membershipVariantId) : 0;
  var MEMBERSHIP_SELLING_PLAN_ID = cfg.membershipSellingPlanId
    ? Number(cfg.membershipSellingPlanId)
    : 0;
  var MEMBERSHIP_PRICE = Number(cfg.membershipPrice) || 0;
  var MEMBERSHIP_HANDLE = (cfg.joinUrl || '/products/cris-method').replace(/^\/products\//, '').split('?')[0];
  var GIFT_PRODUCT_ID = cfg.giftProductId ? String(cfg.giftProductId) : '';
  var MONEY_FORMAT = cfg.moneyFormat || '${{amount}}';
  var IS_MEMBER = !!cfg.isMember;
  var DISCOUNT_CODE = (cfg.discountCode || '').trim();
  var busy = false;
  var originalPriceHtml = {};
  var sellingPlanReady = null;

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
    if (!item) return false;
    if (((item.product_type || '') + '').toLowerCase().trim() === MEMBERSHIP_TYPE) return true;
    if (MEMBERSHIP_VARIANT_ID && Number(item.variant_id) === MEMBERSHIP_VARIANT_ID) return true;
    var handle = (item.handle || '').toLowerCase();
    if (handle && handle === MEMBERSHIP_HANDLE.toLowerCase()) return true;
    return false;
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

  function calcSavings(eligibleCents) {
    return Math.round(eligibleCents * (DISCOUNT_PERCENT / 100));
  }

  function membershipLinePrice(cart) {
    var item = (cart.items || []).find(isMembershipItem);
    if (item) return item.final_line_price;
    return MEMBERSHIP_PRICE;
  }

  function memberLinePrice(item) {
    if (item.original_line_price > item.final_line_price) return item.final_line_price;
    return Math.max(0, item.final_line_price - Math.round(item.final_line_price * (DISCOUNT_PERCENT / 100)));
  }

  function memberUnitPrice(item) {
    if (item.original_price > item.final_price) return item.final_price;
    return Math.max(0, item.final_price - Math.round(item.final_price * (DISCOUNT_PERCENT / 100)));
  }

  function fetchCart() {
    return fetch('/cart.js', { credentials: 'same-origin' }).then(function (r) {
      return r.json();
    });
  }

  function ensureSellingPlan() {
    if (MEMBERSHIP_SELLING_PLAN_ID) {
      return Promise.resolve(MEMBERSHIP_SELLING_PLAN_ID);
    }
    if (sellingPlanReady) return sellingPlanReady;

    sellingPlanReady = fetch('/products/' + encodeURIComponent(MEMBERSHIP_HANDLE) + '.js', {
      credentials: 'same-origin'
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (product) {
        if (product && product.variants && product.variants[0] && !MEMBERSHIP_VARIANT_ID) {
          MEMBERSHIP_VARIANT_ID = Number(product.variants[0].id);
        }
        if (product && product.variants && product.variants[0] && product.variants[0].price) {
          MEMBERSHIP_PRICE = Number(product.variants[0].price) || MEMBERSHIP_PRICE;
        }
        var groups = (product && product.selling_plan_groups) || [];
        for (var g = 0; g < groups.length; g++) {
          var plans = groups[g].selling_plans || [];
          if (plans.length) {
            MEMBERSHIP_SELLING_PLAN_ID = Number(plans[0].id);
            cfg.membershipSellingPlanId = MEMBERSHIP_SELLING_PLAN_ID;
            return MEMBERSHIP_SELLING_PLAN_ID;
          }
        }
        throw new Error('No selling plan found for CEO Club membership.');
      })
      .catch(function (err) {
        sellingPlanReady = null;
        throw err;
      });

    return sellingPlanReady;
  }

  function addMembership() {
    return ensureSellingPlan().then(function (sellingPlanId) {
      if (!MEMBERSHIP_VARIANT_ID) {
        throw new Error('Membership product is not configured.');
      }
      var item = {
        id: MEMBERSHIP_VARIANT_ID,
        quantity: 1,
        selling_plan: sellingPlanId
      };
      return fetch('/cart/add.js', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ items: [item] })
      }).then(function (r) {
        return r.json().then(function (data) {
          if (data && data.status && (data.description || data.message)) {
            throw new Error(data.description || data.message);
          }
          if (data && data.message && !data.items && !data.variant_id && !data.id) {
            throw new Error(data.message);
          }
          return data;
        });
      });
    });
  }

  function removeMembershipItems(cart) {
    var updates = {};
    (cart.items || []).forEach(function (item) {
      if (isMembershipItem(item)) updates[item.key] = 0;
    });
    if (!Object.keys(updates).length) return Promise.resolve(cart);
    return fetch('/cart/update.js', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ updates: updates })
    }).then(function (r) {
      return r.json();
    });
  }

  function applyDiscountCode() {
    if (!DISCOUNT_CODE) return Promise.resolve();
    return fetch('/discount/' + encodeURIComponent(DISCOUNT_CODE), {
      credentials: 'same-origin'
    }).catch(function () {});
  }

  function refreshThemeCart() {
    document.dispatchEvent(new CustomEvent('cart:refresh'));
    if (window.T4SThemeSP && T4SThemeSP.Cart && typeof T4SThemeSP.Cart.getCart === 'function') {
      try {
        T4SThemeSP.Cart.getCart();
      } catch (e) {}
    }
  }

  function syncRadios(hasMembership) {
    document.querySelectorAll('[data-ceo-club-savings]').forEach(function (root) {
      root.querySelectorAll('[data-ceo-mode]').forEach(function (radio) {
        if (radio.value === 'with') radio.checked = !!hasMembership;
        if (radio.value === 'without') radio.checked = !hasMembership;
      });
      root.querySelectorAll('[data-ceo-option]').forEach(function (opt) {
        var mode = opt.getAttribute('data-ceo-option');
        opt.classList.toggle('is-selected', mode === 'with' ? !!hasMembership : !hasMembership);
      });
    });
  }

  function setBusy(on) {
    busy = !!on;
    document.querySelectorAll('[data-ceo-club-savings]').forEach(function (root) {
      root.classList.toggle('is-busy', busy);
      var note = root.querySelector('[data-ceo-busy-note]');
      if (note) note.hidden = !busy;
      root.querySelectorAll('[data-ceo-mode]').forEach(function (input) {
        input.disabled = busy;
      });
    });
  }

  function findCartRows(itemKey) {
    var rows = [];
    document.querySelectorAll('[data-ceo-cart-key="' + itemKey + '"]').forEach(function (el) {
      rows.push(el);
    });
    document.querySelectorAll('input[data-id="' + itemKey + '"]').forEach(function (input) {
      var row = input.closest('[data-cart-item], .t4s-page_cart__item, .t4s-mini_cart__item');
      if (row && rows.indexOf(row) === -1) rows.push(row);
    });
    return rows;
  }

  function memberPriceHtml(retailCents, memberCents) {
    return (
      '<div class="ceo-club-price" data-ceo-price-block>' +
      '<span class="ceo-club-price__retail">Retail ' +
      formatMoney(retailCents) +
      '</span>' +
      '<span class="ceo-club-price__member-label">Member Price</span>' +
      '<span class="ceo-club-price__member">' +
      formatMoney(memberCents) +
      '</span>' +
      '</div>'
    );
  }

  function rememberOriginal(el) {
    var id = el.getAttribute('data-ceo-price-slot');
    if (!id) {
      id = 'slot-' + Math.random().toString(36).slice(2);
      el.setAttribute('data-ceo-price-slot', id);
    }
    if (originalPriceHtml[id] == null) {
      originalPriceHtml[id] = el.innerHTML;
    }
    return id;
  }

  function restoreOriginalPrices() {
    document.querySelectorAll('[data-ceo-price-slot]').forEach(function (el) {
      var id = el.getAttribute('data-ceo-price-slot');
      if (originalPriceHtml[id] != null) {
        el.innerHTML = originalPriceHtml[id];
      }
    });
    document.querySelectorAll('[data-ceo-savings-callout]').forEach(function (el) {
      el.remove();
    });
    document.querySelectorAll('[data-ceo-member-total]').forEach(function (el) {
      el.removeAttribute('data-ceo-member-total');
    });
  }

  function applyMemberPricingToCart(cart, enabled) {
    restoreOriginalPrices();
    if (!enabled) return;

    var productSavings = 0;

    (cart.items || []).forEach(function (item) {
      if (!isEligibleItem(item)) return;

      var retailLine = item.original_line_price || item.final_line_price;
      var retailUnit = item.original_price || item.final_price;
      var memberLine = memberLinePrice(item);
      var memberUnit = memberUnitPrice(item);
      productSavings += Math.max(0, retailLine - memberLine);

      findCartRows(item.key).forEach(function (row) {
        var unitPriceEl = row.querySelector('.t4s-cart_price');
        var linePriceEl = row.querySelector('.t4s-cart-item-price');
        if (unitPriceEl) {
          rememberOriginal(unitPriceEl);
          unitPriceEl.innerHTML = memberPriceHtml(retailUnit, memberUnit);
        }
        if (linePriceEl) {
          rememberOriginal(linePriceEl);
          linePriceEl.innerHTML = memberPriceHtml(retailLine, memberLine);
        }
      });
    });

    var memPrice = membershipLinePrice(cart);
    var memberCartTotal =
      Math.max(0, eligibleSubtotal(cart) - calcSavings(eligibleSubtotal(cart))) + memPrice;
    if (Number(cart.total_discount || 0) > 0) {
      memberCartTotal = cart.total_price;
      productSavings = cart.total_discount;
    }

    document
      .querySelectorAll('[data-cart-prices] .t4s-cart__totalPrice, [data-er-cart-total-price], .t4s-cart__totalPrice')
      .forEach(function (el) {
        rememberOriginal(el);
        el.setAttribute('data-ceo-member-total', 'true');
        el.textContent = formatMoney(memberCartTotal);
      });

    // Only one savings callout on the page (avoid .t4s-cart-total + nested [data-cart-prices])
    if (productSavings > 0 && !document.querySelector('[data-ceo-savings-callout]')) {
      var totalWrap =
        document.querySelector('.t4s-cart-total') ||
        document.querySelector('[data-cart-prices]');
      if (totalWrap) {
        var callout = document.createElement('div');
        callout.className = 'ceo-club-savings-callout';
        callout.setAttribute('data-ceo-savings-callout', '');
        callout.textContent =
          'You saved ' + formatMoney(productSavings) + ' as a CEO Club member on this order!';
        totalWrap.appendChild(callout);
      }
    }
  }

  function updateBanners(cart) {
    var eligible = eligibleSubtotal(cart);
    var savings = calcSavings(eligible);
    var hasEligible = eligible > 0;
    var hasMembership = cartHasMembership(cart);
    var memPrice = membershipLinePrice(cart);
    var withoutTotal = eligible;
    var withTotal = Math.max(0, eligible - savings) + memPrice;
    var showMemberPricing = (hasMembership || IS_MEMBER) && hasEligible;

    applyMemberPricingToCart(cart, showMemberPricing);
    syncRadios(hasMembership);

    var roots = document.querySelectorAll('[data-ceo-club-savings]');
    roots.forEach(function (root) {
      var chooser = root.querySelector('[data-ceo-chooser]');
      var memberMsg = root.querySelector('[data-ceo-member-msg]');
      var savingsEls = root.querySelectorAll('[data-ceo-savings-amount], [data-ceo-savings-amount-alt]');
      var priceWithout = root.querySelector('[data-ceo-price-without]');
      var priceWith = root.querySelector('[data-ceo-price-with]');
      var memPriceEl = root.querySelector('[data-ceo-membership-price]');

      if (IS_MEMBER) {
        if (!hasEligible && !hasMembership) {
          root.hidden = true;
          return;
        }
        root.hidden = false;
        if (chooser) chooser.hidden = true;
        if (memberMsg) memberMsg.hidden = false;
        return;
      }

      if (!hasEligible && !hasMembership) {
        root.hidden = true;
        return;
      }

      root.hidden = false;
      if (chooser) chooser.hidden = false;
      if (memberMsg) memberMsg.hidden = true;

      savingsEls.forEach(function (el) {
        el.textContent = formatMoney(savings);
      });
      if (priceWithout) priceWithout.textContent = formatMoney(withoutTotal);
      if (priceWith) priceWith.textContent = formatMoney(withTotal);
      if (memPriceEl) memPriceEl.textContent = formatMoney(memPrice);

      var pending = root.querySelector('[data-ceo-discount-pending]');
      if (pending) {
        var discountApplied = Number(cart.total_discount || 0) > 0;
        pending.hidden = !(hasMembership && hasEligible && !discountApplied);
      }
    });
  }

  async function setMode(wantMembership) {
    if (busy || IS_MEMBER) return;
    setBusy(true);
    // Don't leave "With" checked unless membership actually lands in cart
    syncRadios(false);

    try {
      var cart = await fetchCart();
      var hasMembership = cartHasMembership(cart);

      if (wantMembership && !hasMembership) {
        await addMembership();
        var afterAdd = await fetchCart();
        if (!cartHasMembership(afterAdd)) {
          throw new Error(
            'Membership could not be added to the cart. Please try again or add CEO Club from the membership product page.'
          );
        }
        await applyDiscountCode();
        cart = afterAdd;
      } else if (!wantMembership && hasMembership) {
        cart = await removeMembershipItems(cart);
      } else {
        cart = await fetchCart();
      }

      refreshThemeCart();
      updateBanners(cart);

      // Cart page: reload so membership line item renders from Liquid
      if (window.location.pathname.indexOf('/cart') !== -1) {
        window.location.reload();
        return;
      }
    } catch (err) {
      console.error('[CEO Club] mode change failed', err);
      alert(err.message || 'Could not update membership in your cart. Please try again.');
      try {
        var latest = await fetchCart();
        updateBanners(latest);
      } catch (e) {
        syncRadios(false);
      }
    } finally {
      setBusy(false);
    }
  }

  function bindEvents() {
    document.addEventListener('change', function (e) {
      var input = e.target.closest('[data-ceo-mode]');
      if (!input) return;
      e.preventDefault();
      setMode(input.value === 'with');
    });

    document.addEventListener('cart:updated', function () {
      fetchCart().then(updateBanners).catch(function () {});
    });
    document.addEventListener('cart:refresh', function () {
      setTimeout(function () {
        fetchCart().then(updateBanners).catch(function () {});
      }, 400);
    });
  }

  function init() {
    bindEvents();
    // Prefetch selling plan so first click is faster/reliable
    ensureSellingPlan().catch(function () {});
    fetchCart()
      .then(updateBanners)
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
