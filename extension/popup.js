const $ = (id) => document.getElementById(id);
chrome.storage.local.get(['server', 'room']).then((c) => {
  $('server').value = c.server || '';
  $('room').value = c.room || '';
});
$('save').onclick = async () => {
  await chrome.storage.local.set({
    server: $('server').value.trim(),
    room: $('room').value.trim(),
  });
  $('msg').textContent = '已儲存，回到影片頁面即可（不需重新整理）';
};
