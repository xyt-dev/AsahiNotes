# `PartialEq` and `#[derive(PartialEq)]`

`PartialEq` looks simple at the surface: it powers `==` and `!=`. Underneath, however, several different mechanisms cooperate:

- `#[derive(PartialEq)]` generates only the outer comparison logic for your type;
- standard-library implementations define how built-in containers, slices, arrays, and references compare;
- trait resolution resolves each nested comparison to the corresponding PartialEq impl, one layer at a time;
- specialization lets selected standard-library comparisons use a bytewise fast path.

This article follows that chain from source code down to the `memcmp`-style optimization.

## 1. What `PartialEq` is

`PartialEq` is the trait behind the `==` and `!=` operators. Roughly,

```rust
a == b
```

desugars to:

```rust
PartialEq::eq(&a, &b)
```

The trait is:

```rust
pub trait PartialEq<Rhs: ?Sized = Self> {
    fn eq(&self, other: &Rhs) -> bool;

    fn ne(&self, other: &Rhs) -> bool {
        !self.eq(other)
    }
}
```

`Rhs` defaults to `Self`, but it can be different. This is what allows implementations such as comparing one string-like type with another compatible string-like type.

PartialEq defines a semantic contract, not a compiler-enforced proof. Its implementations are expected to satisfy symmetry and transitivity whenever the corresponding comparisons exist:

$symmetry:      a == b  ⇔  b == a$

$transitivity:  a == b ∧ b == c  ⇒  a == c$

**The compiler does not verify these laws.** A handwritten PartialEq implementation can violate them and still compile. #[derive(PartialEq)] preserves them provided that the PartialEq implementations of all compared fields obey the same contract, because the derived implementation simply composes those field comparisons.

PartialEq deliberately does not require reflexivity: `a == a` may be false. Floating-point values are the standard example: NaN != NaN, so floating-point types implement PartialEq but not Eq.

`Eq` is a marker trait:

`pub trait Eq: PartialEq<Self> {}`

It defines no new comparison operation. Instead, implementing Eq adds the semantic promise that the existing PartialEq implementation is also reflexive:

$\text{reflexivity:}~~a == a~~\text{for every value a.}$

**This promise is not proved by the compiler either.** In fact, none of the three equality laws are compiler-verified: PartialEq promises symmetry and transitivity, while Eq additionally promises reflexivity.

Thus:

$$
\mathrm{PartialEq}
=
\left\{
\begin{aligned}
&\text{symmetry:} && a = b \iff b = a, \\
&\text{transitivity:} && (a = b \land b = c) \Rightarrow a = c
\end{aligned}
\right.
$$

$$
\mathrm{Eq}
=
\mathrm{PartialEq}
\cup
\left\{
\text{reflexivity: } a = a
\right\}
$$

A relation that is reflexive, symmetric, and transitive is called an equivalence relation. Therefore, implementing `Eq` means promising that the equality relation defined by PartialEq is an equivalence relation.

`#[derive(Eq)]` does not generate another equality algorithm. The actual comparison still comes entirely from `PartialEq`; deriving `Eq` only generates the marker implementation, and the derive is accepted only when the relevant field types satisfy the required `Eq` bounds.

With the semantic distinction between `PartialEq` and `Eq` established, the rest of the discussion focuses on how `PartialEq` implementations are actually produced and composed.

You can implement `PartialEq` manually:

```rust
struct Point {
    x: i32,
    y: i32,
}

impl PartialEq for Point {
    fn eq(&self, other: &Self) -> bool {
        self.x == other.x && self.y == other.y
    }
}
```

or ask the compiler to generate the implementation:

```rust
#[derive(PartialEq)]
struct Point {
    x: i32,
    y: i32,
}
```

---

## 2. what `#[derive(PartialEq)]` actually generates

`#[derive(PartialEq)]` is a built-in derive macro. it expands the annotated type into an ordinary `impl PartialEq for ...`.

The generated implementation defines `eq`; `ne` continues to use the default method provided by the trait.

Generated impls are marked with `#[automatically_derived]`. This marker has no semantic effect; it simply lets compiler tools distinguish derive-generated impls from handwritten ones, mainly so diagnostics and lints can avoid blaming code the user did not write.

The most important rule is:  
**Derive generates only the outer PartialEq implementation for the annotated type. Nested field types are compared through their own `PartialEq` implementations, which derive does not recursively expand.**

For example, if a field has type `Inner`, derive emits an ordinary comparison such as:

```rust
self.inner == other.inner
```

and stops there. That comparison uses Inner's own PartialEq implementation.

The next section shows how this composition works for the main data shapes in Rust.

---

## 3. comparison by data shape

The structure of the generated `eq` implementation depends on the shape of the annotated type. The following sections show how equality is implemented for primitive values, structs, enums, and standard container types.

### 3.1 Primitive Types

Primitive scalar types such as integers, `bool`, and `char` have equality operations built into the language. A direct comparison such as:

```rust
let a: i32 = 1;
let b: i32 = 2;

a == b
```

is handled as a primitive comparison by the compiler; it does not require a runtime call to `PartialEq::eq`.

`core` nevertheless provides `PartialEq` impls for primitive types so the same comparison semantics are available through the trait system. For example, the integer implementation is essentially:

```rust
impl PartialEq for i32 {
    fn eq(&self, other: &Self) -> bool {
        *self == *other
    }
}
```

Here, both operands are already known to be primitive integers, so the `== `expression is lowered to the compiler's primitive integer comparison rather than a runtime call back into the same `PartialEq::eq` implementation.

The impl therefore serves as the trait-level interface to primitive equality.
It is needed when `i32` is used through `PartialEq`, such as in generic code with `T: PartialEq`; the actual comparison still ends at the compiler's built-in integer equality operation.

### 3.2 structs

For a struct, derive compares every field and joins the results with `&&`.

Given:

```rust
#[derive(partialeq)]
struct point {
    x: i32,
    y: i32,
}
```

the important part of the expansion is equivalent to:

```rust
impl partialeq for point {
    fn eq(&self, other: &point) -> bool {
        self.x == other.x && self.y == other.y
    }
}
```

For nesting:

```rust
#[derive(partialeq)]
struct outer {
    inner: inner,
}
```

derive stops at:

```rust
self.inner == other.inner
```

It does **not** paste `inner`'s comparison body into `outer`.

`Inner` only needs to implement `PartialEq` somehow—through derive, a handwritten implementation, or an implementation provided elsewhere.

---

### 3.3 enums

For an enum, derive first compares the discriminants of the two values. If the discriminants are equal, it then compares the fields of the corresponding variant.

For example:

```rust
#[derive(PartialEq)]
enum Shape {
    Circle(i32),
    Point,
}
```

the important part of the generated implementation is roughly equivalent to:

```rust
impl PartialEq for Shape {
    fn eq(&self, other: &Shape) -> bool {
        let self_discr = ::core::intrinsics::discriminant_value(self);
        let other_discr = ::core::intrinsics::discriminant_value(other);

        self_discr == other_discr
            && match (self, other) {
                (Shape::Circle(a), Shape::Circle(b)) => a == b,
                _ => true,
            }
    }
}
```

The discriminant comparison handles the variant itself. If the two values have different variants, it evaluates to false, and the right-hand side of && is not evaluated.

If the discriminants are equal, derive only needs to compare the fields of variants that contain data. For `Shape::Circle`, the generated match arm compares its field:

`a == b`

For a fieldless variant such as `Shape::Point`, there are no fields left to compare, so equality is already established by the discriminant check. This is why the generated match can fall through to `_ => true`.

The structure can therefore be viewed as:

<img
  src="/EnumPartialEqCompare.png"
  alt="Enum PartialEq comparison"
  width="600px"
/>

As with structs, `derive` only generates the enum's outer comparison structure: discriminant checking and field-by-field comparisons. Any nested comparison is delegated to that field type's own `PartialEq` implementation rather than recursively expanded by `derive`.

---

## 4. Slices and arrays

`derive` does not generate the internal equality algorithm for slices or arrays. When a derived field comparison reaches one of these types, it uses the corresponding standard-library `PartialEq` implementation.

The interesting part is that these implementations do not always compare elements one by one. For suitable element types, the standard library can specialize equality into a comparison of the underlying bytes.

### 4.1 Slice equality

The `PartialEq` implementation for slices first checks their lengths:

```rust
const impl<T, U> PartialEq<[U]> for [T]
where
    T: [const] PartialEq<U>,
{
    fn eq(&self, other: &[U]) -> bool {
        let len = self.len();

        if len == other.len() {
            unsafe {
                SlicePartialEq::equal_same_length(
                    self.as_ptr(),
                    other.as_ptr(),
                    len,
                )
            }
        } else {
            false
        }
    }
}
```

The bound `T: [const] PartialEq<U>` expresses the element-level requirement: comparing [T] with [U] is possible only when values of `T` can be compared with values of `U`.

Once the lengths are known to be equal, the public `PartialEq` implementation delegates the actual comparison to the internal S`licePartialEq::equal_same_length` method.

The important point is that `equal_same_length` does not have one fixed implementation.

---

### 4.2 `SlicePartialEq` as the specialization point

The standard library uses an internal trait roughly shaped like:

```rust
#[doc(hidden)]
const trait SlicePartialEq<B> {
    /// # Safety
    /// `lhs` and `rhs` are both readable for `len` elements.
    unsafe fn equal_same_length(
        lhs: *const Self,
        rhs: *const B,
        len: usize,
    ) -> bool;
}
```

Its generic implementation performs an ordinary element-by-element comparison:

```rust
const impl<A, B> SlicePartialEq<B> for A
where
    A: [const] PartialEq<B>,
{
    #[rustc_no_mir_inline]
    default unsafe fn equal_same_length(
        lhs: *const Self,
        rhs: *const B,
        len: usize,
    ) -> bool {
        let mut idx = 0;

        while idx < len {
            if unsafe { *lhs.add(idx) != *rhs.add(idx) } {
                return false;
            }

            idx += 1;
        }

        true
    }
}
```

This implementation works for every pair of element types satisfying `A: PartialEq<B>`.

The `default` keyword is important: this implementation deliberately acts as the fallback for a more specific overlapping implementation.

That specialization point is the reason `SlicePartialEq` exists between the public slice `PartialEq` implementation and the actual comparison loop.

---

### 4.3 `BytewiseEq` and the bytewise fast path

Some types can implement equality by comparing their object representation directly.

The standard library represents this property with the internal unsafe marker trait `BytewiseEq`.

Its safety contract is stronger than ordinary `PartialEq`. Roughly, the two types must:

* have the same layout,
* contain no padding,
* contain no provenance,
* and produce the same `eq` and `ne` results as a raw representation comparison.

The important point is that `BytewiseEq` is not merely a mathematical statement that two equality results happen to coincide. It is an unsafe optimization contract: implementing it permits the standard library and compiler to replace typed equality with raw byte or integer comparisons.

The restrictions above therefore ensure both that the result remains correct and that the representation-level comparison itself is valid.

Padding violates the first requirement. Padding bytes are not part of a value's semantic contents, so two values can be equal field by field while containing different bytes in their padding.

Floating-point values provide another example:

```text
-0.0 == +0.0
```

is `true`, even though `-0.0` and `+0.0` have different bit representations. Raw representation equality therefore does not preserve `PartialEq`.

Provenance is a slightly different restriction.

In Rust's memory model, a pointer carries provenance in addition to its numeric address. Provenance is semantic information associated with the pointer, but it does not necessarily occupy additional bits in the native pointer representation.

Consequently, two pointers with the same address may have identical machine representations and also compare equal even if their provenance differs.

So provenance is not excluded because it necessarily makes byte equality disagree with `PartialEq`.

Instead, the problem is that a provenance-carrying value cannot in general be treated as nothing more than ordinary integer bits. `BytewiseEq` permits exactly such a representation-level implementation of equality, so its safety contract requires provenance-free values.

In other words:

```text
padding / floating point
    -> raw representation equality may produce the wrong result

provenance
    -> raw integer/byte comparison is not in general a valid
       replacement operation for a provenance-carrying value
```

For element types satisfying `BytewiseEq`, `SlicePartialEq` provides a more specific implementation:

```rust
const impl<A, B> SlicePartialEq<B> for A
where
    A: [const] BytewiseEq<B>,
{
    #[inline]
    unsafe fn equal_same_length(
        lhs: *const Self,
        rhs: *const B,
        len: usize,
    ) -> bool {
        unsafe {
            let size = crate::intrinsics::unchecked_mul(len, Self::SIZE);
            compare_bytes(lhs as _, rhs as _, size) == 0
        }
    }
}
```

Instead of invoking `PartialEq` once for every element, this implementation compares the entire memory range using `compare_bytes`.

`compare_bytes` is a compiler intrinsic:

```rust
#[rustc_intrinsic]
pub const unsafe fn compare_bytes(
    left: *const u8,
    right: *const u8,
    bytes: usize,
) -> i32;
```

The compiler can lower this representation-level comparison efficiently, typically to a `memcmp`-style operation for sufficiently large ranges.

The resulting dispatch is:

```text
[T] == [U]
    |
    +-- lengths differ
    |       |
    |       `-- false
    |
    `-- lengths equal
            |
            +-- T: BytewiseEq<U>
            |       |
            |       `-- compare the whole byte range
            |
            `-- otherwise
                    |
                    `-- compare elements one by one
```

This is the purpose of the hidden `SlicePartialEq` layer: it creates a specialization point between the public `PartialEq` implementation and the actual comparison strategy.

The generic implementation provides the element-by-element fallback, while the more specific `BytewiseEq` implementation replaces it whenever raw representation comparison is both semantically correct and valid for the element type.

---

### 4.4 Arrays

Arrays use a separate internal specialization path, `SpecArrayEq`. When the element types implement `BytewiseEq`, the entire array can be compared directly with `raw_eq`; otherwise the implementation falls back to slice equality.

This follows the same principle as the slice optimization above, so the array-specific machinery is not discussed further here.

## 5. Standard containers

### 5.1 `Vec<T>`

`Vec<T>` forwards equality to slices:

```rust
impl<T: PartialEq> PartialEq for Vec<T> {
    fn eq(&self, other: &Vec<T>) -> bool {
        self[..] == other[..]
    }
}
```

So:

```text
Vec<T>
   -> [T]
      -> SlicePartialEq
         -> element loop or bytewise fast path
```

---

### 5.2 `String`

`String` derives `PartialEq` over its single internal field:

```rust
#[derive(PartialEq, PartialOrd, Eq, Ord)]
pub struct String {
    vec: Vec<u8>,
}
```

Conceptually, its derived equality is:

```rust
impl PartialEq for String {
    fn eq(&self, other: &String) -> bool {
        self.vec == other.vec
    }
}
```

Therefore:

```text
String
    -> Vec<u8>
    -> [u8]
    -> bytewise comparison
```

`String` also provides separate `PartialEq` implementations for comparisons with `str` and `&str`, but those are additional cross-type comparisons rather than the implementation used for `String == String`.

---

### 5.3 `Option<T>`

`Option<T>` compares variants first:

```text
None     == None     -> true
Some(a)  == Some(b)  -> a == b
None     == Some(_)  -> false
Some(_)  == None     -> false
```

The payload comparison again delegates to `T`'s own `PartialEq`.

---

### 5.4 `Box<T>`

`Box<T>` comparison forwards to the contained value.

The box itself is not semantically compared by pointer address; equality is determined by the pointee's `PartialEq`.

---

## 6. References

The standard library provides forwarding implementations for references.

Conceptually:

```rust
const impl<A: PointeeSized, B: PointeeSized> PartialEq<&B> for &A
where
    A: [const] PartialEq<B>,
{
    fn eq(&self, other: &&B) -> bool {
        PartialEq::eq(*self, *other)
    }
}
```

So:

```text
&A == &B
```

forwards to:

```text
A == B
```

with corresponding mutable-reference variants as well.

This is why generated comparisons involving fields bound by reference can look as though they introduce another `&` layer without changing the semantic comparison target: the reference implementation simply forwards to the underlying types.

---

## 7. How nesting actually composes

Consider:

```rust
Vec<Vec<i32>>
```

The comparison chain is conceptually:

```text
Vec<Vec<i32>> == Vec<Vec<i32>>
    |
    v
[Vec<i32>] == [Vec<i32>]
    |
    v
compare each Vec<i32>
    |
    v
[i32] == [i32]
    |
    v
bytewise-compatible integer comparison
```

Nothing in `#[derive(PartialEq)]` recursively expands this entire chain.

Every layer contributes exactly one ordinary `PartialEq` implementation, and trait resolution composes them.

That is the central model to keep in mind.

---

## 8. The whole mechanism in one table

| Layer | Responsibility |
| --- | --- |
| `#[derive(PartialEq)]` | Generate the current type's field/variant comparison shell |
| stdlib `PartialEq` impls | Define equality for slices, arrays, references, and containers |
| hidden helper traits | Introduce internal dispatch points such as `SlicePartialEq` |
| specialization | Select a more specific implementation when allowed |
| `BytewiseEq` | Prove that semantic equality is equivalent to byte equality |
| backend intrinsic | Lower the byte comparison to efficient machine code |
| trait resolution | Connect all of the above recursively |

The most important invariant is:

> **nesting is handled by trait resolution, not by recursive derive expansion.**

A derived type only emits comparisons of its immediate fields. Each field type is then responsible for its own equality semantics.

---

## 9. A compact mental model

For ordinary derived data:

```text
derive
  -> compare immediate fields
     -> each field's PartialEq
        -> repeat until a concrete implementation is reached
```

For slices:

```text
slice PartialEq
  -> length check
  -> SlicePartialEq
       -> generic element loop
       -> or BytewiseEq specialization
            -> compare_bytes
```

For nested containers:

```text
outer container
  -> asks whether its element type has a fast path
  -> otherwise compares elements
       -> each element may itself have another fast path
```

That is the full story: `derive` builds only the outer shell; the standard library supplies the reusable comparison machinery; specialization chooses selected internal fast paths; and the type system composes everything one layer at a time.
