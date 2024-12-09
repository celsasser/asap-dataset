##
# I don't know how tests are run on this R planet. This is more of a task runner
# that will hopefully honor break points, which doesn't seem to happen
# in quarto files. Boy, breakpoints behave oddly. Oh, my bad. You need to
# CMD + shift + enter (whatever this is called) the code after changes. I'm sure
# that doesn't not make sense...
##

test_load_music <- function() {
  manifest <- load_manifest()
  songs <- load_music(manifest$scores)
}

test_canonical_range <- function() {
  canonicals <- generate_canonical_note_range()
  print(canonicals)
}

f_test_variability <- function() {
  tbl_manifest <- load_manifest()
  mlist <- load_music(tbl_manifest$scores)
  half <- floor(length(mlist) / 2)
  tbl_old <- bind_rows(mlist[1:half])
  tbl_new <- bind_rows(mlist[(half + 1):length(mlist)])
  result <- var.test(tbl_old$note_normal, tbl_new$note_normal)
  return(result)
}

result <- f_test_variability()
