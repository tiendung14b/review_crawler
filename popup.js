document.addEventListener('DOMContentLoaded', () => {
  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const nextPageBtn = document.getElementById('nextPageBtn');
  const downloadJsonBtn = document.getElementById('downloadJsonBtn');
  const downloadCsvBtn = document.getElementById('downloadCsvBtn');
  const statusText = document.getElementById('statusText');
  const reviewCount = document.getElementById('reviewCount');

  const locationNameInput = document.getElementById('locationName');
  const locationDescInput = document.getElementById('locationDesc');
  const openHoursInput = document.getElementById('openHours');
  const closeHoursInput = document.getElementById('closeHours');
  const autoNextPageInput = document.getElementById('autoNextPage');

  // Load saved inputs
  chrome.storage.local.get(['locationName', 'locationDesc', 'openHours', 'closeHours', 'autoNextPage'], (result) => {
    if (result.locationName) locationNameInput.value = result.locationName;
    if (result.locationDesc) locationDescInput.value = result.locationDesc;
    if (result.openHours) openHoursInput.value = result.openHours;
    if (result.closeHours) closeHoursInput.value = result.closeHours;
    if (result.autoNextPage !== undefined) autoNextPageInput.checked = result.autoNextPage;
  });

  // Save inputs on change
  const saveInputs = () => {
    chrome.storage.local.set({
      locationName: locationNameInput.value,
      locationDesc: locationDescInput.value,
      openHours: openHoursInput.value,
      closeHours: closeHoursInput.value,
      autoNextPage: autoNextPageInput.checked
    });
  };

  locationNameInput.addEventListener('input', saveInputs);
  locationDescInput.addEventListener('input', saveInputs);
  openHoursInput.addEventListener('input', saveInputs);
  closeHoursInput.addEventListener('input', saveInputs);
  autoNextPageInput.addEventListener('change', () => {
    saveInputs();
    sendMessageToContentScript({ action: "SET_AUTO_NEXT", value: autoNextPageInput.checked });
  });

  function getMetaData() {
    return {
      locationName: locationNameInput.value,
      locationDesc: locationDescInput.value,
      openHours: openHoursInput.value,
      closeHours: closeHoursInput.value
    };
  }

  // Hàm tiện ích để gửi tin nhắn tới content script của tab hiện tại
  async function sendMessageToContentScript(message) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return null;
    
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      console.error("Could not establish connection. Make sure you are on a supported page.", error);
      statusText.innerText = "Lỗi: Không tìm thấy Content Script (Tải lại trang)";
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
    const response = await sendMessageToContentScript({ 
      action: "START", 
      autoNextPage: autoNextPageInput.checked 
    });
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
    sendMessageToContentScript({ action: "DOWNLOAD_JSON", meta: getMetaData() });
  });

  downloadCsvBtn.addEventListener('click', () => {
    sendMessageToContentScript({ action: "DOWNLOAD_CSV", meta: getMetaData() });
  });

  // Gọi check khi popup mở
  checkStatus();
});
