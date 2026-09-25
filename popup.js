document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const downloadJsonBtn = document.getElementById('downloadJsonBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const statusText = document.getElementById('statusText');
  const reviewCount = document.getElementById('reviewCount');

  // Hàm tiện ích để gửi tin nhắn tới content script của tab hiện tại
  async function sendMessageToContentScript(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return null;
    
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      console.error("Could not establish connection. Make sure you are on a Booking.com attractions page.", error);
      statusText.innerText = "Lỗi: Không tìm thấy Content Script (Tải lại trang Booking)";
      statusText.style.color = "red";
      return null;
    }
  }

  // Khởi tạo: kiểm tra trạng thái hiện tại
  async function checkStatus() {
    const response = await sendMessageToContentScript({ action: "GET_STATUS" });
    if (response) {
      updateUI(response.isScraping, response.count, response.lastPageCount);
    }
  }

  function updateUI(isScraping, count, lastPageCount) {
    reviewCount.innerText = count;
    
    if (isScraping) {
      statusText.innerText = "Trạng thái: Đang cào dữ liệu...";
      statusText.style.color = "#0071c2";
      startBtn.disabled = true;
      stopBtn.disabled = false;
      downloadJsonBtn.disabled = true;
      downloadCsvBtn.disabled = true;
    } else {
      statusText.innerText = "Trạng thái: Đã dừng";
      statusText.style.color = "#333";
      startBtn.disabled = false;
      stopBtn.disabled = true;
      
      if (count > 0) {
        downloadJsonBtn.disabled = false;
        downloadCsvBtn.disabled = false;
      } else {
        downloadJsonBtn.disabled = true;
        downloadCsvBtn.disabled = true;
      }
    }

    // Làm mờ nút Chuyển trang nếu số lượng chưa tăng so với lần chuyển trang trước đó
    if (count <= (lastPageCount || 0)) {
      nextPageBtn.disabled = true;
    } else {
      nextPageBtn.disabled = false;
    }
  }

  // Lắng nghe thông báo cập nhật từ content script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "UPDATE_STATUS") {
      updateUI(request.isScraping, request.count, request.lastPageCount);
    }
  });

  // Sự kiện nút
  startBtn.addEventListener('click', async () => {
    statusText.innerText = "Trạng thái: Đang khởi động...";
    statusText.style.color = "#0071c2";
    const response = await sendMessageToContentScript({ action: "START" });
    if (response) {
      updateUI(true, response.count, response.lastPageCount);
    }
  });

  stopBtn.addEventListener('click', async () => {
    statusText.innerText = "Trạng thái: Đang dừng...";
    const response = await sendMessageToContentScript({ action: "STOP" });
    if (response) {
      updateUI(false, response.count, response.lastPageCount);
    }
  });

  nextPageBtn.addEventListener('click', async () => {
    nextPageBtn.disabled = true; // Làm mờ ngay lập tức để tránh click nhiều lần
    await sendMessageToContentScript({ action: "NEXT_PAGE" });
    checkStatus(); // Lấy lại trạng thái mới nhất
  });

  downloadJsonBtn.addEventListener('click', () => {
    sendMessageToContentScript({ action: "DOWNLOAD_JSON" });
  });

  downloadCsvBtn.addEventListener('click', () => {
    sendMessageToContentScript({ action: "DOWNLOAD_CSV" });
  });

  // Gọi check khi popup mở
  checkStatus();
});
