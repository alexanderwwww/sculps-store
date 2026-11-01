import subprocess, json, time
def get(url, post=None, tries=4):
    for i in range(tries):
        cmd=['curl','-sS','-m','40',url]
        if post is not None: cmd+=['-X','POST','-H','content-type: application/json','-d',json.dumps(post)]
        r=subprocess.run(cmd,capture_output=True,text=True)
        try:
            return json.loads(r.stdout)
        except Exception:
            time.sleep(3*(i+1))
    return None
