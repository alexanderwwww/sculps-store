#!/usr/bin/env python3
"""
HELIOS — download every store image + video into organised folders, then zip.

RUN IT:
    python3 helios-download-media.py

No installs needed (uses only the Python standard library).
Creates ./HELIOS-MEDIA/ with sorted folders, then ./HELIOS-MEDIA.zip

Windows: install Python from python.org, then in PowerShell:  python helios-download-media.py
Mac:     Python 3 is already there. Open Terminal, cd to this folder, run the command.
"""
import os, sys, zipfile, urllib.request, urllib.error

OUT = "HELIOS-MEDIA"
CDN = "https://cdn.shopify.com/s/files/1/0769/8320/6053/files/"
VID = "https://cdn.shopify.com/videos/c/vp/"

IMAGES = {
"01-superglide-product": [
 ("S422daeaa8a1f4d90b13ccc8979923d65e_jpg_960x960q75_jpg.avif?v=1782437342","01-joystick-closeup.avif"),
 ("3a816736-4b57-464c-9f16-4e8c196bc71b.png?v=1782835882","02-floating-blue-water.png"),
 ("image0_1.jpg?v=1783204946","03-ugc-image0.jpg"),
 ("296a5f2a-c3b3-4a72-9d9b-ba15a5292497.png?v=1782073106","04-dual-motor-joysticks.png"),
 ("image1.jpg?v=1783204946","05-ugc-image1.jpg"),
 ("05c1f105-d779-40af-b7e7-b8fe9c9ab11c.png?v=1782073104","06-person-relaxing-pool.png"),
 ("1.png?v=1782882243","07-hero-1.png"),
 ("image3_d6e90ee2-7b19-4ad2-8285-52ac2d416659.jpg?v=1783205127","08-ugc-image3.jpg"),
 ("image2.jpg?v=1783204932","09-ugc-image2.jpg"),
 ("ea2f32ef-bfe1-458a-b6ca-198d2b733c04.png?v=1782073104","10-headrest-cupholders.png"),
 ("6b543510-61c2-4338-8573-5501c919fbb2.png?v=1782801208","11-cruising-lake-handsfree.png"),
 ("5bbd06e1-0d08-4751-adba-4df78915c768_a415d687-6c37-4bfe-8413-ae7e3ae7d85b.png?v=1782801659","12-side-profile.png"),
 ("fffb7355-9fdd-4fba-a028-6e3d6aaa638d.png?v=1782083771","13-family-float.png"),
 ("3a816736-4b57-464c-9f16-4e8c196bc71b_adaed97e-2eae-4cf8-8ffb-97742e49df9e.png?v=1782872283","14-blue-water-alt.png"),
 ("6935b6e3-82ec-43dd-8f18-49cf4efeec47.png?v=1782801803","15-product.png"),
 ("ed800814-8280-4515-ab36-29f15996c019.png?v=1782882243","16-product.png"),
 ("359ded2c-3def-48f5-90fe-7b69429864fb.png?v=1782882243","17-product.png"),
 ("a32ec115-3760-47bb-bbe3-083acc6fd039.png?v=1782882529","18-product.png"),
 ("fd83911c-aec4-43dc-ae97-646d6ecf8832.png?v=1782883492","19-product.png"),
 ("15191dd0-e775-4369-b2e6-e971ef1bc314.png?v=1782083771","20-product.png"),
 ("e9fb0f5c-a5b1-4458-85ad-5eddd16bb1ed.png?v=1782073103","21-product.png"),
 ("e9fb0f5c-a5b1-4458-85ad-5eddd16bb1ed_6c59158c-a851-4d0f-b1bd-aad2f48116a7.png?v=1782083162","22-product-alt.png"),
 ("2b37e998-3cf9-4f52-a61f-e590a56a4348.png?v=1782073104","23-product.png"),
 ("c6e27d47-a213-45d6-ae65-78508e6a8c30.png?v=1782073103","24-product.png"),
 ("d0ebcd1a-9bbb-4134-9b0d-b86d7bfdf77c.png?v=1782073103","25-product.png"),
 ("dc2c954a-9703-4f27-be9f-72b4eb0dd591.png?v=1782073103","26-product.png"),
 ("6b950131-0c3f-4007-8546-471c356701a8.png?v=1782073102","27-product.png"),
 ("4895b315-407c-4b68-8694-52cd841fd746.png?v=1782073102","28-product.png"),
 ("a5f7cd0b-9088-4a9d-85a3-30077aa9dbe4.png?v=1782073099","29-product.png"),
 ("a3180277-9325-4bf1-a6a9-a3e8f38dfa15.png?v=1782073097","30-product.png"),
 ("01f6dd44-cf3f-4dc5-96cd-8f29e0d00013.png?v=1782073094","31-product.png"),
 ("f697753e-6153-4fbc-a0a1-bfece0f77338.png?v=1782088190","32-product.png"),
 ("22d59bd6-563d-4a57-9dac-08967f86026c.png?v=1782718073","33-badge.png"),
],
"02-mini-glide": [
 ("5bbd06e1-0d08-4751-adba-4df78915c768_71510d92-9ef2-40cb-bd3b-8205a6388f86.png?v=1782094143","01-mini-glide.png"),
 ("5bbd06e1-0d08-4751-adba-4df78915c768_dec6a2e9-0287-42e6-b4a2-fc3f56c18f4a.png?v=1782800578","02-mini-single-seat.png"),
 ("5bbd06e1-0d08-4751-adba-4df78915c768.png?v=1782087513","03-mini-base.png"),
 ("9cfbc993-fa02-4c85-845e-6a9fa32ea69f.png?v=1782087513","04-mini.png"),
 ("c8d06404-24c2-44cb-ba24-85a276df6cb4.png?v=1782087513","05-mini-wide.png"),
 ("image3.jpg?v=1783205019","06-mini-ugc.jpg"),
],
"03-jetski": [
 ("a7b05a36-528c-44ca-8a1a-7a9add23058b.png?v=1782714655","01-jetski-hero-FREEGIFT.png"),
 ("47dc11ca-3353-4ed4-8275-40acf8fa5523.png?v=1782714656","02-jetski.png"),
 ("cd2aeedb-4378-48c1-bcab-5b7a5aa6b319.png?v=1782715284","03-jetski.png"),
 ("bf3d9cd7-1cd6-43a1-b5ec-aca96cc17d42.png?v=1782715284","04-jetski.png"),
 ("1f5c6e20-e5ac-4087-9a79-afe9d999db05.png?v=1782715856","05-jetski.png"),
 ("8d5f8a15-4de4-4007-9f6a-79da093f4572.png?v=1782715284","06-jetski.png"),
 ("8f3e2827-5ae4-42ee-8245-80053d268442.png?v=1782714655","07-jetski.png"),
 ("a5dd56d8-fede-4897-97e3-ad87e62234ba.png?v=1782714655","08-jetski.png"),
],
"04-sofa-pool": [
 ("paradise-sofa-pool.jpg?v=1783802762","01-hero-girls-day.jpg"),
 ("ed49f19c-8cc6-4990-b5be-3ba5145c75db_885dfa1f-91a9-4cc9-a704-93168f84a9e4.png?v=1783804303","02-product-shot.png"),
 ("a8e1ad39-6db1-4b9f-8f8c-5e473dcc7ade_85761380-2f47-4119-a22e-fc05423de543.png?v=1783804303","03-product-shot-2.png"),
 ("pool-styled-wide.jpg?v=1783804302","04-styled-backyard.jpg"),
 ("pool-umbrella-shells.jpg?v=1783804303","05-sofa-umbrella.jpg"),
 ("pool-detail-hand.jpg?v=1783804302","06-material-detail.jpg"),
 ("pool-snack-tray.jpg?v=1783804303","07-snack-tray.jpg"),
 ("ed49f19c-8cc6-4990-b5be-3ba5145c75db.png?v=1783804023","08-product-orig.png"),
 ("a8e1ad39-6db1-4b9f-8f8c-5e473dcc7ade.png?v=1783804024","09-product-orig-2.png"),
],
"05-party-island": [
 ("island-hero.jpg?v=1783930294","01-hero-6-people.jpg"),
 ("island-2.jpg?v=1783930294","02-with-canopy.jpg"),
 ("island-3.jpg?v=1783930294","03-backrest-detail.jpg"),
 ("island-4.jpg?v=1783930294","04-cooler-cupholders.jpg"),
 ("island-5.jpg?v=1783930294","05-on-the-lake.jpg"),
 ("island-6.jpg?v=1783930294","06-canopy-view.jpg"),
 ("island-7.jpg?v=1783930294","07-top-view.jpg"),
],
"06-pump-upsell": [
 ("107f7b2d-9d3a-4d8f-bcfe-b0bfa133a1b8.png?v=1783791768","01-cordless-pump-FREEGIFT.png"),
],
"07-review-photos": [
 ("brandon.jpg?v=1782724570","brandon-h.jpg"),
 ("tyler.jpg?v=1782724571","tyler-p.jpg"),
 ("nicole.jpg?v=1782724570","nicole-a.jpg"),
 ("matt.jpg?v=1782724571","matt-d.jpg"),
 ("jessica.jpg?v=1782724571","jessica-m.jpg"),
 ("ryan.jpg?v=1782724571","ryan-c.jpg"),
 ("g_hero.jpg?v=1782725725","ugc-inflated.jpg"),
 ("g_box.jpg?v=1782725725","ugc-delivery-box.jpg"),
 ("g_side.jpg?v=1782725725","ugc-side.jpg"),
 ("g_setup.jpg?v=1782725725","ugc-setup.jpg"),
 ("g_kid.jpg?v=1782725725","ugc-kid.jpg"),
 ("g_twokids.jpg?v=1782725725","ugc-two-kids.jpg"),
 ("g_hero_15adc6f4-8a7f-44b8-9a8f-177e7eaadbd0.jpg?v=1782766099","ugc-inflated-b.jpg"),
 ("g_box_6f3cadfc-12bc-4faa-a31f-cb645b3efa99.jpg?v=1782766100","ugc-box-b.jpg"),
 ("g_side_58a8782a-79b9-433e-9d4f-777d333ef9aa.jpg?v=1782766100","ugc-side-b.jpg"),
 ("g_setup_6c508243-62c3-4e30-a179-7689e4937344.jpg?v=1782766099","ugc-setup-b.jpg"),
 ("g_kid_2583f893-2e8d-451f-9dc2-752d57b1d017.jpg?v=1782766100","ugc-kid-b.jpg"),
 ("g_twokids_aba770c3-39b3-4a12-88e5-891bbd745de9.jpg?v=1782766099","ugc-two-kids-b.jpg"),
],
"08-helios-fan-OTHER-PRODUCT": [
 ("hero-still.png?v=1781888349","01-hero-still.png"),
 ("helios-fan.png?v=1781888348","02-fan.png"),
 ("helios-fan-cutout.png?v=1781888348","03-fan-cutout.png"),
 ("exploded.png?v=1781888356","04-exploded-view.png"),
 ("prod-ice.png?v=1781888356","05-product-ice.png"),
 ("macro.png?v=1781888357","06-macro.png"),
 ("nyc-poster.png?v=1781888357","07-nyc-poster.png"),
 ("life-a.png?v=1781888356","08-lifestyle-a.png"),
 ("life-b.png?v=1781888356","09-lifestyle-b.png"),
 ("life-c.png?v=1781888357","10-lifestyle-c.png"),
 ("life-d.png?v=1781888357","11-lifestyle-d.png"),
 ("spin-1.png?v=1781888347","12-spin-1.png"),
 ("spin-2.png?v=1781888347","13-spin-2.png"),
 ("spin-3.png?v=1781888347","14-spin-3.png"),
 ("spin-4.png?v=1781888347","15-spin-4.png"),
 ("spin-5.png?v=1781888347","16-spin-5.png"),
 ("spin-6.png?v=1781888347","17-spin-6.png"),
]}

VIDEOS = [
 ("1ad7d3b52a8f4658883007bf25591332","HD-720p-1.6Mbps-88724104","sofapool-coolers-demo.mp4"),
 ("7107b4312d42481fbdacb4458bf29a61","HD-720p-1.6Mbps-88715260","sofapool-ugc.mp4"),
 ("a9eb5029ae0d4f0e817fb55493545906","HD-720p-4.5Mbps-88555875","superglide-01.mp4"),
 ("b2c69b012cd1408bad6931149ee976f0","HD-720p-4.5Mbps-87716364","superglide-02.mp4"),
 ("6e6519ea877d4866ba801895c0765bfc","HD-720p-4.5Mbps-87645145","jetski-01.mp4"),
 ("f4ff36f60e284cecb8c4e5ca91fb57b7","HD-720p-4.5Mbps-87616689","jetski-02.mp4"),
 ("dc98abffc9ae4241a7def42cb8a3df81","HD-720p-4.5Mbps-87616408","jetski-03.mp4"),
 ("44e8338daa144e308018db0564e1494d","HD-720p-1.6Mbps-87537391","ugc-01.mp4"),
 ("b104a8c36b9146a7b6b3711173f8ff3a","HD-720p-1.6Mbps-87537390","ugc-02.mp4"),
 ("e025e8b1677b4e1480eed0ba6f9ece4c","HD-720p-1.6Mbps-87537392","ugc-03.mp4"),
 ("d485c3263f964c818ee82d39de445b8b","HD-720p-2.1Mbps-87512421","ugc-04.mp4"),
 ("fca2b3a4bda64d8c875e662a31c79b04","HD-720p-2.1Mbps-87367898","ugc-05.mp4"),
 ("40bd6dd06bda44efa1949012b522519d","HD-720p-1.6Mbps-87367897","ugc-06.mp4"),
 ("e1ffdcb34c104d87a2c6e035beb96a87","HD-720p-3.0Mbps-87362078","ugc-07.mp4"),
 ("12f5ba29b5e34fc98077729463b90e61","SD-480p-0.9Mbps-87085768","miniglide-01.mp4"),
 ("8b5d1f9900524c04b447f85e0aa248dc","SD-480p-0.9Mbps-87085501","miniglide-02.mp4"),
 ("abb479a970874259bd0da225e3e3c8cc","SD-480p-0.9Mbps-87085492","miniglide-03.mp4"),
 ("69ce695f044f40c5871e37ce6f88d7e8","HD-720p-1.6Mbps-87085412","miniglide-04.mp4"),
 ("b674c0772e984df6a5f0551a3e607579","SD-480p-0.9Mbps-87085406","miniglide-05.mp4"),
 ("981fbf3bb19643549919743aa25a1427","SD-480p-0.9Mbps-87085089","miniglide-06.mp4"),
 ("a33c15ea27904439b37233833725e803","SD-480p-0.9Mbps-87085077","miniglide-07.mp4"),
 ("e93afb54798d4cc2b288d4209338a0d7","HD-720p-1.6Mbps-87084353","miniglide-08.mp4"),
 ("24cd20ab528947b0b444517c1c32becd","HD-720p-1.6Mbps-87083746","miniglide-09.mp4"),
 ("f0fc9a539c1f49489041121a379bea10","HD-720p-1.6Mbps-87083707","miniglide-10.mp4"),
 ("b7459318cd884d84b474b4174764e4ab","HD-720p-4.5Mbps-87077877","superglide-03.mp4"),
 ("8218c41ebc214edab6796f045c78cbe3","HD-720p-4.5Mbps-87077869","superglide-04.mp4"),
 ("095177a605974fadbc2af8c24e75674a","HD-720p-4.5Mbps-87077868","superglide-05.mp4"),
 ("2e6766d6bb084ad690b1e99d8956b861","HD-720p-4.5Mbps-87077872","superglide-06.mp4"),
 ("008e9254d48243279d92b286601f768b","HD-720p-4.5Mbps-87077871","superglide-07.mp4"),
 ("cbfe1d99bf404a749e90ecf963dba798","HD-720p-4.5Mbps-87077870","superglide-08.mp4"),
 ("88321d72519743c3a8001def675d474c","HD-720p-4.5Mbps-87077876","superglide-09.mp4"),
 ("41547269e12949829090b71869c4e1e1","HD-720p-4.5Mbps-87077875","superglide-10.mp4"),
 ("47b20f8b4238405190f51ce7aa6b4996","HD-720p-4.5Mbps-87077874","superglide-11.mp4"),
 ("efa0417fa9164a198302a71e7736b6d4","HD-720p-4.5Mbps-87077873","superglide-12.mp4"),
 ("152e9f73ed4444bdbc3b6812b8195311","SD-480p-0.9Mbps-87077867","superglide-13.mp4"),
 ("efd9ee7ed80e43cb9c4ec032992aef94","HD-720p-1.6Mbps-87031668","promo-01.mp4"),
 ("44e043cdd0e141c5bba7ec33a739a65f","HD-720p-1.6Mbps-87031665","promo-02.mp4"),
 ("434d6d8ddd5e494b9532e75afb524593","HD-720p-1.6Mbps-87031667","promo-03.mp4"),
 ("e18595deb67c4a9eb59d7369d5619efb","HD-720p-1.6Mbps-87031666","promo-04.mp4"),
 ("fab607dfcc5342c08d250f8c45137b0e","HD-720p-1.6Mbps-86965424","fan-01.mp4"),
 ("17d238dbd72a4e41a5f78c1a8dddf454","HD-720p-1.6Mbps-86965427","fan-02.mp4"),
 ("d9e853a2a84143c29a8bea1b48f8ecd4","HD-720p-1.6Mbps-86965425","fan-03.mp4"),
 ("93c925dfd85b4cebbecc7ffc53230ec4","HD-720p-1.6Mbps-86965426","fan-04.mp4"),
]

ok = fail = 0
failed_names = []

def grab(url, dest):
    global ok, fail
    if os.path.exists(dest) and os.path.getsize(dest) > 500:
        ok += 1
        return
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=180) as r, open(dest, "wb") as f:
            while True:
                chunk = r.read(65536)
                if not chunk:
                    break
                f.write(chunk)
        ok += 1
        print(f"  ok  {os.path.basename(dest)}")
    except Exception as e:
        fail += 1
        failed_names.append(os.path.basename(dest))
        print(f"  FAIL {os.path.basename(dest)}  ({e})")
        if os.path.exists(dest):
            os.remove(dest)

print("Downloading HELIOS media...\n")
for folder, items in IMAGES.items():
    d = os.path.join(OUT, folder)
    os.makedirs(d, exist_ok=True)
    print(f"[{folder}]")
    for cdn_name, save in items:
        grab(CDN + cdn_name, os.path.join(d, save))

vd = os.path.join(OUT, "09-videos")
os.makedirs(vd, exist_ok=True)
print("\n[09-videos]  (these are big — be patient)")
for vid, quality, save in VIDEOS:
    grab(f"{VID}{vid}/{vid}.{quality}.mp4", os.path.join(vd, save))

print(f"\nDone.  Downloaded: {ok}   Failed: {fail}")
if failed_names:
    print("Failed files:", ", ".join(failed_names))

print("\nZipping...")
with zipfile.ZipFile(OUT + ".zip", "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(OUT):
        for fn in files:
            p = os.path.join(root, fn)
            z.write(p, os.path.relpath(p, "."))
size = os.path.getsize(OUT + ".zip") / (1024 * 1024)
print(f"Created {OUT}.zip  ({size:.1f} MB)")
