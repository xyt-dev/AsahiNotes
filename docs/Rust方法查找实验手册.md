# Method resolution in Rust

`value.f()` resolves against a fixed candidate sequence: `T` -> `&T` -> `&mut T` -> `recursive dereferencing along Deref`, the lookup phase selects the first match, and if the borrow check fails, it errors without fallback.

Verification method:

When compiling and running directly, each group hits the first item. To verify the Nth item of the group, comment out all the preceding `impl_f!()` lines in that group.

Complete program:

```rust
mod receiver_is_outer {
    use super::{Deref, DerefMut};

    #[derive(Clone, Copy)]
    struct Inner;

    #[derive(Clone, Copy)]
    struct Outer(Inner);

    impl Deref for Outer {
        type Target = Inner;

        fn deref(&self) -> &Inner {
            &self.0
        }
    }

    impl DerefMut for Outer {
        fn deref_mut(&mut self) -> &mut Inner {
            &mut self.0
        }
    }

    trait F {
        fn f(self);
    }

    macro_rules! impl_f {
        ($ty:ty => $message:literal) => {
            impl F for $ty {
                fn f(self) {
                    println!($message);
                }
            }
        };
    }

    // Comment out these lines one by one from top to bottom to verify the order of the methods.
    impl_f!(Outer      => "A1: Outer");
    impl_f!(&Outer     => "A2: &Outer");
    impl_f!(&mut Outer => "A3: &mut Outer");
    impl_f!(Inner      => "A4: Inner");
    impl_f!(&Inner     => "A5: &Inner");
    impl_f!(&mut Inner => "A6: &mut Inner");

    pub fn run() {
        // Note: Even if the variable is mut, the expression type is still Outer, 
        // so &Outer still comes out before &mut Outer. 
        let value = Outer(Inner);
        value.f();
    }
}

mod receiver_is_shared_outer {
    use super::{Deref, DerefMut};

    #[derive(Clone, Copy)]
    struct Inner;

    #[derive(Clone, Copy)]
    struct Outer(Inner);

    impl Deref for Outer {
        type Target = Inner;

        fn deref(&self) -> &Inner {
            &self.0
        }
    }

    impl DerefMut for Outer {
        fn deref_mut(&mut self) -> &mut Inner {
            &mut self.0
        }
    }

    trait F {
        fn f(self);
    }

    macro_rules! impl_f {
        ($ty:ty => $message:literal) => {
            impl F for $ty {
                fn f(self) {
                    println!($message);
                }
            }
        };
    }

    impl_f!(&Outer      => "B1/B5: &Outer（Same type, first hit in B1）");
    impl_f!(&&Outer     => "B2: &&Outer");
    impl_f!(&mut &Outer => "B3: &mut &Outer");
    impl_f!(Outer       => "B4: Outer");
    // B5 is exactly the same as B1。
    impl_f!(&mut Outer  => "B6: &mut Outer");
    impl_f!(Inner       => "B7: Inner");
    impl_f!(&Inner      => "B8: &Inner");
    impl_f!(&mut Inner  => "B9: &mut Inner");

    pub fn run() {
        let outer = Outer(Inner);

        let value: &Outer = &outer;
        value.f();
    }
}

mod receiver_is_mut_outer {
    use super::{Deref, DerefMut};

    #[derive(Clone, Copy)]
    struct Inner;

    #[derive(Clone, Copy)]
    struct Outer(Inner);

    impl Deref for Outer {
        type Target = Inner;

        fn deref(&self) -> &Inner {
            &self.0
        }
    }

    impl DerefMut for Outer {
        fn deref_mut(&mut self) -> &mut Inner {
            &mut self.0
        }
    }

    trait F {
        fn f(self);
    }

    macro_rules! impl_f {
        ($ty:ty => $message:literal) => {
            impl F for $ty {
                fn f(self) {
                    println!($message);
                }
            }
        };
    }

    impl_f!(&mut Outer      => "C1/C6: &mut Outer");
    impl_f!(&&mut Outer     => "C2: &&mut Outer");
    impl_f!(&mut &mut Outer => "C3: &mut &mut Outer");
    impl_f!(Outer           => "C4: Outer");
    impl_f!(&Outer          => "C5: &Outer");
    impl_f!(Inner           => "C7: Inner");
    impl_f!(&Inner          => "C8: &Inner");
    impl_f!(&mut Inner      => "C9: &mut Inner");

    pub fn run() {
        let mut outer = Outer(Inner);

        let value: &mut Outer = &mut outer;
        value.f();
    }
}

fn main() {
    receiver_is_outer::run();
    
    receiver_is_shared_outer::run();
    
    receiver_is_mut_outer::run();
}
```