# The carousel

The product-page gallery, the way a marketplace does it.

> "I want a remake of the carousel. I want it square. I want it big. I want it to fit
> full. I want the pictures to be one of one square so they fit full. All the products
> have to carry exactly eight thumbnails on the carousel. That's it. Final."
> — Alex, 19 Sep

## The shape

**One big square frame, and a row of small square thumbnails under it.** That is the
entire design. It is what AliExpress, Temu, Amazon and Walmart all do, and it is what a
shopper's eye already knows how to read.

### The main frame

- `aspect-ratio: 1 / 1`. Always square, never 4:3, never 16:9.
- **As wide as its column, and no height cap.** A listing image earns the room it takes.
- `object-fit: cover`, **zero padding**. The picture fills the frame edge to edge.
- A frame that insets its picture makes the product smaller than it needs to be. That was
  the old mistake: a 14px pad on a 620px frame, so the hero of the page sat inside a
  margin nobody asked for.

Because every listing image is authored square, `cover` never crops anything. It only
stops the frame from adding a margin.

### The thumbnails

- **Fixed small squares**, 64px on desktop, 56px on a phone. Not a strip stretched to the
  column width.
- Left-aligned in a flex row, wrapping to a second line if needed.
- `object-fit: cover`, **zero padding** — a thumbnail with a pad inside it is a grey
  square with a dot in the middle.
- Thin hairline border. The selected one takes the accent colour at 2px. No glow, no
  outer ring, no shadow.

Stretching eight thumbnails across a 560px column makes each one a 60px **rectangle** of
mostly background. At a fixed 64px they are square, they are the same size on every
product however many pictures it has, and the row reads as a row of products.

## Exactly eight

**Every product carries exactly eight thumbnails.** Not six, not eleven. Eight.

It is a rule about the shape of the page, not about the pictures: eight squares fill one
tidy row and read as a complete set. A product with five looks unfinished; one with
fourteen looks like a folder someone forgot to tidy.

The eight are the eight panels in `panels.md`, in that order. Anything else the product
has — old photography, a spec graphic — comes out of the gallery, or goes further down
the page in a section of its own.

## Bundles

**The bundle boxes themselves stay exactly as they are.** The picker, the prices, the
wording — none of that is touched.

What changes is the **little picture on each bundle row**: it gets the same clarity as
everything else. Square, the product cut out and filling the square, edge to edge, no
inset. A shopper choosing between ONE and TWO must see the difference between the two
rows at a glance — one figure against two figures — without reading the label.

## Nothing else moves

The carousel change is the frame, the thumbnails, and the eight. It does not touch the
buy box, the price, the reviews, the cross-sell, or anything below the fold.
