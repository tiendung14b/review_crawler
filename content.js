// content.js
let isScraping = false;
let scrapedReviews = [];
let uniqueKeys = new Set(); // Dùng để loại bỏ trùng lặp
let observer = null;
let extractTimer = null;
let lastPageCount = 0;
let isAutoNext = false;

// Hàm trích xuất dữ liệu từ trang hiện tại
function extractReviewsFromPage() {
  let reviewCards = document.querySelectorAll('div[data-automation="reviewCard"], div[data-testid="review-item"], div[data-testid="review-card"]');
  if (reviewCards.length === 0) {
    reviewCards = document.querySelectorAll('li.b0bf4dc58f, div.review_list_item, div[itemprop="review"], [data-testid="reviews-list"] > div');
  }

  let newlyAdded = 0;

  reviewCards.forEach(card => {
    // Tìm thẻ tác giả, loại bỏ thẻ chứa ảnh đại diện (thường có aria-hidden="true")
    const authorEl = card.querySelector('a[href*="/Profile/"]:not([aria-hidden="true"]), .biGQs._P.ezezH a, [data-testid="review-author-name"], .bui-avatar-block__title, [itemprop="author"]');
    
    let country = '';
    let contributions = '';
    
    // TripAdvisor logic for Country & Contributions
    const taAuthorInfoEl = card.querySelector('.vYLts .navcl');
    if (taAuthorInfoEl) {
      taAuthorInfoEl.childNodes.forEach(node => {
        let txt = node.textContent.trim();
        // Loại bỏ dấu chấm tròn (bullet) thường gặp ở TA
        txt = txt.replace(/^•\s*/, '').replace(/•/g, '').trim();
        if (!txt) return;
        
        if (txt.toLowerCase().includes('contribution')) {
          contributions = txt.replace(/\D/g, '');
        } else if (!country) {
          country = txt;
        }
      });
    } else {
      // Booking.com logic
      const countryEl = card.querySelector('[data-testid="review-author-country"], .bui-avatar-block__subtitle, .bui-avatar-block__text--muted');
      if (countryEl) country = countryEl.innerText.trim();
    }
    
    // Group Type & Date of Experience (TripAdvisor)
    let groupType = '';
    const taExpGroupEl = card.querySelector('.jXCrq');
    if (taExpGroupEl) {
      const parts = taExpGroupEl.innerText.split('•').map(s => s.trim());
      if (parts.length >= 2) {
        groupType = parts.slice(1).join(' ').trim();
      } else if (parts.length === 1 && !parts[0].match(/\d{4}/)) {
        groupType = parts[0];
      }
    }

    const ratingEl = card.querySelector('svg[data-automation="bubbleRatingImage"] title, [data-testid="review-star-rating"], [data-testid="review-score"], .bui-review-score__badge, [itemprop="ratingValue"], .bui-rating');
    
    // Date
    let date = '';
    let taWrittenDate = '';
    const taWrittenEls = card.querySelectorAll('[class*="navcl"]');
    taWrittenEls.forEach(el => {
      const txt = el.innerText.trim();
      if (txt.toLowerCase().startsWith('written')) {
        taWrittenDate = txt.replace(/^Written\s*/i, '').trim();
      }
    });

    if (taWrittenDate) {
      date = taWrittenDate;
    } else {
      const dateEl = card.querySelector('.css-7jm4mj > div:last-child, [data-testid="review-date"], .c-review-block__date, [itemprop="datePublished"]');
      if (dateEl) date = dateEl.innerText.trim();
    }

    const titleEl = card.querySelector('[data-test-target="review-title"], [data-testid="review-title"], .c-review-block__title, [itemprop="name"]');
    const contentEl = card.querySelector('.JguWG, .biGQs._P.VImYz.AWdfh, .css-2rjphs > div > div > div, [data-testid="review-text"], .c-review__body, [itemprop="reviewBody"]');

    let rating = '';
    if (ratingEl) {
      if (ratingEl.tagName && ratingEl.tagName.toLowerCase() === 'title') {
        rating = ratingEl.textContent.trim();
      } else {
        rating = ratingEl.getAttribute('aria-label') || ratingEl.innerText.trim();
      }
      const ratingMatch = rating.match(/\d+(\.\d+)?/);
      if (ratingMatch) rating = ratingMatch[0];
    }
    
    if (date) {
      const cleanDateStr = date.replace(/Reviewed:?\s*/i, '').trim();
      const parsed = new Date(cleanDateStr);
      if (!isNaN(parsed)) {
        date = parsed.toISOString().split('T')[0];
      }
    }

    let content = '';
    if (contentEl) {
      content = contentEl.innerText.trim();
    } else {
      const pos = card.querySelector('.review_pos');
      const neg = card.querySelector('.review_neg');
      if (pos) content += pos.innerText.trim() + " ";
      if (neg) content += neg.innerText.trim();
    }

    const review = {
      author: authorEl ? authorEl.innerText.trim() : '',
      country: country,
      contributions: contributions,
      groupType: groupType,
      rating: rating,
      date: date,
      title: titleEl ? titleEl.innerText.trim() : '',
      content: content.trim()
    };

    if (!review.author && !review.content) return;

    const uniqueKey = `${review.author}-${review.content}`;
    if (!uniqueKeys.has(uniqueKey)) {
      uniqueKeys.add(uniqueKey);
      scrapedReviews.push(review);
      newlyAdded++;
    }
  });

  return newlyAdded;
}

// Báo cáo số lượng về popup
function updatePopupStatus() {
  chrome.runtime.sendMessage({ 
    action: "UPDATE_STATUS", 
    isScraping: isScraping, 
    count: scrapedReviews.length,
    lastPageCount: lastPageCount
  }).catch(() => {});
}

// Chế độ lắng nghe DOM thụ động
function startObserving() {
  if (observer) return;

  // Lấy dữ liệu ở trang đang đứng ngay lập tức
  const initialCount = extractReviewsFromPage();
  if (initialCount > 0) updatePopupStatus();
  
  if (isAutoNext) {
    setTimeout(() => {
      if (isScraping) {
        lastPageCount = scrapedReviews.length;
        goToNextPageByNumber();
      }
    }, 2000);
  }

  // Gắn MutationObserver vào Body để theo dõi
  // Khi bạn tự bấm Next bằng tay, Booking sẽ tải lại khu vực Review, làm DOM thay đổi
  observer = new MutationObserver((mutations) => {
    if (!isScraping) return;

    // Dùng Debounce (đợi 1 giây) để đảm bảo trình duyệt đã render xong toàn bộ review mới
    clearTimeout(extractTimer);
    extractTimer = setTimeout(() => {
      const added = extractReviewsFromPage();
      if (added > 0) {
        console.log(`Đã bắt tự động thêm ${added} đánh giá mới.`);
        updatePopupStatus();
        
        if (isAutoNext) {
          setTimeout(() => {
            if (isScraping) {
              lastPageCount = scrapedReviews.length;
              goToNextPageByNumber();
            }
          }, 2000);
        }
      }
    }, 1000); 
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log("Đã bật chế độ Lắng nghe DOM (MutationObserver).");
}

function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
    clearTimeout(extractTimer);
    console.log("Đã dừng chế độ Lắng nghe DOM.");
  }
}

// Xuất file JSON
function downloadJSON(meta) {
  if (scrapedReviews.length === 0) return;
  
  const dataToExport = {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
    locationName: meta?.locationName || '',
    locationDesc: meta?.locationDesc || '',
    openHours: meta?.openHours || '',
    closeHours: meta?.closeHours || '',
    reviews: scrapedReviews
  };
  
  const dataStr = JSON.stringify(dataToExport, null, 2);
  const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reviews_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Xuất file CSV
function downloadCSV(meta) {
  if (scrapedReviews.length === 0) return;
  
  const headers = ['Location Name', 'Location Desc', 'Open Hours', 'Close Hours', 'Author', 'Country', 'Contributions', 'Group Type', 'Rating', 'Date', 'Title', 'Content'];
  const csvRows = scrapedReviews.map(review => {
    return [
      meta?.locationName || '',
      meta?.locationDesc || '',
      meta?.openHours || '',
      meta?.closeHours || '',
      review.author,
      review.country,
      review.contributions,
      review.groupType,
      review.rating,
      review.date,
      review.title,
      review.content
    ].map(val => `"${(val || '').replace(/"/g, '""')}"`).join(','); 
  });
  
  const csvContent = [headers.join(','), ...csvRows].join('\n');
  const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
  const blob = new Blob([bom, csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reviews_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Lắng nghe lệnh từ Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START") {
    if (request.autoNextPage !== undefined) {
      isAutoNext = request.autoNextPage;
    }
    if (!isScraping) {
      isScraping = true;
      startObserving();
    }
    sendResponse({ isScraping, count: scrapedReviews.length, lastPageCount });
  } 
  else if (request.action === "STOP") {
    isScraping = false;
    stopObserving();
    sendResponse({ isScraping, count: scrapedReviews.length, lastPageCount });
  }
  else if (request.action === "GET_STATUS") {
    sendResponse({ isScraping, count: scrapedReviews.length, lastPageCount });
  }
  else if (request.action === "SET_AUTO_NEXT") {
    isAutoNext = request.value;
    if (isAutoNext && isScraping) {
      lastPageCount = scrapedReviews.length;
      goToNextPageByNumber();
    }
    sendResponse({ success: true });
  }
  else if (request.action === "DOWNLOAD_JSON") {
    downloadJSON(request.meta);
    sendResponse({ success: true });
  }
  else if (request.action === "DOWNLOAD_CSV") {
    downloadCSV(request.meta);
    sendResponse({ success: true });
  }
  else if (request.action === "NEXT_PAGE") {
    lastPageCount = scrapedReviews.length;
    goToNextPageByNumber();
    sendResponse({ success: true });
  }
  return true; 
});

function goToNextPageByNumber() {
  const taNextBtn = document.querySelector('a[data-smoke-attr="pagination-next-arrow"]');
  if (taNextBtn && !taNextBtn.hasAttribute('disabled')) {
    taNextBtn.click();
    console.log("Đã chuyển sang trang tiếp theo (Tripadvisor)");
    return true;
  }

  const currentBtn = document.querySelector('button[aria-current="page"]');
  
  if (currentBtn) {
    const currentPageNum = parseInt(currentBtn.innerText.trim(), 10);
    if (!isNaN(currentPageNum)) {
      const nextPageNum = currentPageNum + 1;
      
      const buttons = document.querySelectorAll('button');
      for (let btn of buttons) {
        if (btn.innerText.trim() === nextPageNum.toString()) {
          btn.click();
          console.log(`Đã chuyển sang trang ${nextPageNum}`);
          return true;
        }
      }
      console.log(`Không tìm thấy nút cho trang ${nextPageNum}`);
    }
  } else {
    console.log("Không tìm thấy nút trang hiện tại");
  }
  
  // Nếu đến cuối cùng hoặc không tìm thấy
  if (isAutoNext) {
    isScraping = false;
    stopObserving();
    updatePopupStatus();
    console.log("Đã kết thúc tự động cào vì không còn trang tiếp theo.");
  }
  return false;
}
