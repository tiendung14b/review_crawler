// content.js
let isScraping = false;
let scrapedReviews = [];
let uniqueKeys = new Set(); // Dùng để loại bỏ trùng lặp
let observer = null;
let extractTimer = null;
let lastPageCount = 0;

// Hàm trích xuất dữ liệu từ trang hiện tại
function extractReviewsFromPage() {
  let reviewCards = document.querySelectorAll('div[data-testid="review-item"], div[data-testid="review-card"]');
  if (reviewCards.length === 0) {
    reviewCards = document.querySelectorAll('li.b0bf4dc58f, div.review_list_item, div[itemprop="review"], [data-testid="reviews-list"] > div');
  }

  let newlyAdded = 0;

  reviewCards.forEach(card => {
    const authorEl = card.querySelector('.css-1lxwves > div, [data-testid="review-author-name"], .bui-avatar-block__title, [itemprop="author"]');
    const countryEl = card.querySelector('[data-testid="review-author-country"], .bui-avatar-block__subtitle, .bui-avatar-block__text--muted');
    const ratingEl = card.querySelector('[data-testid="review-star-rating"], [data-testid="review-score"], .bui-review-score__badge, [itemprop="ratingValue"], .bui-rating');
    const dateEl = card.querySelector('.css-7jm4mj > div:last-child, [data-testid="review-date"], .c-review-block__date, [itemprop="datePublished"]');
    const titleEl = card.querySelector('[data-testid="review-title"], .c-review-block__title, [itemprop="name"]');
    const contentEl = card.querySelector('.css-2rjphs > div > div > div, [data-testid="review-text"], .c-review__body, [itemprop="reviewBody"]');

    let rating = '';
    if (ratingEl) {
      rating = ratingEl.getAttribute('aria-label') || ratingEl.innerText.trim();
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
      country: countryEl ? countryEl.innerText.trim() : '',
      rating: rating,
      date: dateEl ? dateEl.innerText.trim() : '',
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
function downloadJSON() {
  if (scrapedReviews.length === 0) return;
  const dataStr = JSON.stringify(scrapedReviews, null, 2);
  const blob = new Blob([dataStr], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `booking_reviews_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Xuất file CSV
function downloadCSV() {
  if (scrapedReviews.length === 0) return;
  
  const headers = ['Author', 'Country', 'Rating', 'Date', 'Title', 'Content'];
  const csvRows = scrapedReviews.map(review => {
    return [
      review.author,
      review.country,
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
  a.download = `booking_reviews_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Lắng nghe lệnh từ Popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "START") {
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
  else if (request.action === "DOWNLOAD_JSON") {
    downloadJSON();
    sendResponse({ success: true });
  }
  else if (request.action === "DOWNLOAD_CSV") {
    downloadCSV();
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
          return;
        }
      }
      console.log(`Không tìm thấy nút cho trang ${nextPageNum}`);
    }
  } else {
    console.log("Không tìm thấy nút trang hiện tại (aria-current='page')");
  }
}
