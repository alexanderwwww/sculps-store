---
name: listing-images
description: How Alex's product images and product-page carousels are made — the marketplace panel style (AliExpress / Temu / Amazon clarity with our aesthetic), the square-thumbnail carousel layout, and the Magic Wand pipeline that generates, downloads and places the pictures. Use this for any store, any product, any time the work touches carousel images, thumbnails, listing graphics, product photography, ad creative, or queueing a job to the Magic Wand. Trigger it when Alex says "the images", "the carousel", "the thumbnails", "do the pictures", "the panels", "queue the wand", or names a product that needs pictures — for Black Reaper, Garden Buddy, bodies, or a store that does not exist yet.
---

# Listing images

How a product is photographed, drawn and laid out so a stranger buys it.

This applies to **every store Alex runs, now and in the future**. It is not Halloween
specific and not Black Reaper specific.

## The one idea

Said by Alex, holding up AliExpress, Temu, Amazon, Alibaba and Walmart listings:

> They feel stable. They understand in the first three seconds why they are there and what
> this thing does, and they immediately stop questioning and start imagining the emotion
> they are trying to achieve. This dopamine — they imagine the feeling why they bought the
> product. They stop trying to analyse what the fuck it is doing.
>
> It's full of text. Yes, it looks like crap. Of course it looks like crap. But it offers
> clarity. Look at how AliExpress presents the website and the thumbnails — clean, you
> understand in one second what you are looking at. I want this thing on our website, but
> with the beauty and aesthetics we try to achieve.

A shopper who has to work stops working and leaves. The image does the work instead.
Take the marketplace's **clarity** and keep **our look**. Both, never one.

## What this replaced

Beautiful night photographs with four words in the corner. They look expensive, and they
are wrong: the shopper still has to work out what the thing is, how big it is, how it is
powered and what arrives in the box. Every one of those questions is a reason to leave.

## Read next

- `references/panels.md` — the **eight** panels every product gets, and exactly how each
  is drawn. Read before writing a single image prompt.
- `references/prompt-spine.md` — the shared body of every prompt: the permitted-word
  list, the banned words, the anti-carryover paragraph, and the rules that were each
  bought with a rejected render (truth about the product, how scale and people work,
  the two-colour palette, the American setting, and how an image meant to run as an ad
  differs). Read it with `panels.md`, before writing or correcting a prompt.
- `references/look.md` — the ground, the one accent colour, the type, the icons, and the
  complete list of things that must never appear in an image.
- `references/carousel.md` — the product-page layout: one square frame, a strip of small
  square thumbnails, the AliExpress shape.
- `references/magic-wand.md` — how to queue a job, approve it, watch it, download what it
  made and put it on the store without Alex touching anything.

## The rules that never change

1. **Exactly eight thumbnails per product.** Not six, not eleven. The eight panels, in
   order. Anything else comes out of the gallery.
2. **Square 1:1.** Every listing image. A 16:9 picture in a square frame is grey bands
   and a smaller product, and it is the single most repeated complaint on this project.
3. **One product per job.** One reference picture, attached once. Never four products in
   one job.
4. **Look at every picture before it reaches the store.** Open it. A trademarked costume,
   a cable on a battery product, a wrong price line — all of these shipped because a
   picture was placed without being seen.
5. **Never overwrite a file in R2.** `/media/*` is cached immutable for a year, so an
   overwritten key changes nothing on his screen for a year. Always a new filename.
6. **Never invent a fact.** Sizes, power, what is in the box — from the product record,
   not from the imagination. Getting a fact wrong on an image is worse than having no
   image.
