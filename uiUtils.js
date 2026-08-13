// Utility UI generiche (toast e modale di conferma) estratte da script.js.

export const showToast = (message, isError = false) => {
    document.querySelectorAll('.custom-toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = 'custom-toast ' + (isError ? 'toast-error' : 'toast-success');
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

export const showCustomConfirm = (message, onConfirm) => {
    const overlay = document.createElement('div');
    overlay.className = 'popup-overlay';

    const box = document.createElement('div');
    box.className = 'popup-box popup-box-confirm';

    const text = document.createElement('p');
    text.innerText = message;

    const btnContainer = document.createElement('div');
    btnContainer.className = 'confirm-btn-row';

    const btnCancel = document.createElement('button');
    btnCancel.innerText = 'Annulla';
    btnCancel.className = 'confirm-btn-cancel';

    const btnConfirm = document.createElement('button');
    btnConfirm.innerText = 'Elimina';
    btnConfirm.className = 'confirm-btn-danger';

    const closeModal = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 200);
    };

    btnCancel.onclick = closeModal;
    btnConfirm.onclick = () => {
        onConfirm();
        closeModal();
    };

    btnContainer.appendChild(btnCancel);
    btnContainer.appendChild(btnConfirm);
    box.appendChild(text);
    box.appendChild(btnContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    setTimeout(() => overlay.classList.add('show'), 10);
};
