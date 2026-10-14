"""8787 が応答しなければ起動して待つ。撮影前の必須チェック。"""
import subprocess, sys, time, urllib.request, os

BASE = r"C:\Users\hohoh/Desktop/ht_projyekuto/triad"
LOG = os.path.join(os.path.expanduser("~"), "Desktop", "scs-sec", "_rec", "_srv.log")

def ok():
    try:
        with urllib.request.urlopen("http://127.0.0.1:8787/api/ledger", timeout=8) as r:
            return r.status == 200
    except Exception:
        return False

def ensure(verbose=True):
    if ok():
        if verbose: print("  server: already up")
        return True
    # 古いプロセスを止める
    r = subprocess.run(
        'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8787 -State Listen '
        '-ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"',
        shell=True, capture_output=True, text=True, timeout=60)
    for pid in set(x.strip() for x in (r.stdout or "").split("\n") if x.strip()):
        subprocess.run('powershell -NoProfile -Command "Stop-Process -Id %s -Force '
                       '-ErrorAction SilentlyContinue"' % pid,
                       shell=True, capture_output=True, timeout=60)
    time.sleep(2)
    log = open(LOG, "w")
    subprocess.Popen("node demo/server.mjs", shell=True, cwd=BASE,
                     stdout=log, stderr=subprocess.STDOUT)
    for i in range(12):
        time.sleep(2)
        if ok():
            if verbose: print("  server: started")
            return True
    if verbose: print("  server: FAILED to start")
    return False

if __name__ == "__main__":
    sys.exit(0 if ensure() else 1)
