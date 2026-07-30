import './styles.css';

const runtimeStatus = document.querySelector<HTMLSpanElement>('#runtime-status');

if (!runtimeStatus) {
  throw new Error('The runtime status element is missing.');
}

const showRuntimeStatus = async (): Promise<void> => {
  try {
    const appInfo = await window.desktop.getAppInfo();
    runtimeStatus.textContent = `${appInfo.name} ${appInfo.version} · isolated renderer`;
  } catch {
    runtimeStatus.textContent = 'Runtime information is unavailable.';
    runtimeStatus.closest('.runtime')?.classList.add('runtime--error');
  }
};

void showRuntimeStatus();
