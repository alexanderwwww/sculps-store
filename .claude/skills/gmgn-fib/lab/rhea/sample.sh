K=YFu9uEm3fUwr928Yn70Qov73wVWbEZj
for i in $(seq 1 24); do curl -sS -m 10 https://kerberos.gardenbuddystore.workers.dev/ultra/$K/status | python3 -I -c "
import sys,json,time
s=json.load(sys.stdin);e=s['engine']
print(round(time.time()),s['at']//1000,e['ticks'],round(e['lastTickAt']/1000),len(e['open']),e['counts'],e['trades'],round(e['equity'],5),[ (o['name'][:8],o['ret'],round(time.time()-o['since']/1000)) for o in e['open']], len(e['errors']) and e['errors'][-1])
"; sleep 5; done
