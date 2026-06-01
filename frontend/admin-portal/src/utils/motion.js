export const pageVariants = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.07 } },
  },
  item: {
    hidden:  { y: 14, opacity: 0 },
    visible: { y: 0,  opacity: 1, transition: { duration: 0.32, ease: "easeOut" } },
  },
};

export const listVariants = {
  container: {
    hidden: {},
    visible: { transition: { staggerChildren: 0.04 } },
  },
  item: {
    hidden:  { x: -8, opacity: 0 },
    visible: { x: 0,  opacity: 1, transition: { duration: 0.22, ease: "easeOut" } },
  },
};

export const modalVariants = {
  hidden:  { scale: 0.94, opacity: 0, y: 12 },
  visible: { scale: 1,    opacity: 1, y: 0  },
  exit:    { scale: 0.94, opacity: 0, y: 12 },
};

export const springTransition = { type: "spring", stiffness: 340, damping: 28 };
