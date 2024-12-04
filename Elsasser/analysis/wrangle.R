# We came, we saw and we wrangled.
library(purrr)
library(tidyverse)

#' Get the root of the ASAP project
#' @return normalized path
get_asap_root <- function() {
  getwd() |>
    file.path("../..") |>
    normalizePath()
}

#' Load the metadata manifest. There are two types of data (that we care about)
#' in the ASAP manifest: performance and score. There is a many to one relationship,
#' many performances to a single score. It doesn't make sense to return them as
#' a unit, because they are very different animals. This function is going to
#' do some wrangling and separate them into two separate dataframes and
#' eliminate the redundancy.
#'
#' @param root the root of the ASAP project
#' @return a named `list` with two `tibbles`: `perfs` and `scores`
load_manifest <- function(root = get_asap_root()) {
  manifest_path <- file.path(root, "metadata.csv")
  # we are adding an ID so that we can join performances and scores to their manifest.
  tbl_manifest <- read_csv(manifest_path, show_col_types = FALSE)
  tbl_perfs <- tbl_manifest |>
    mutate(id = row_number()) |>
    rename(path = csv_performance) |>
    select(id, composer, year_born, year_died, title, performer, path)
  tbl_scores <- tbl_manifest |>
    distinct(composer, year_born, year_died, title, csv_score) |>
    mutate(
      id = row_number(),
      # There are no performers for scores. Nonetheless, we are adding `performer`
      # to scores so that our DF is compatible and interchangeable with `perfs`.
      performer = NA,
    ) |>
    rename(path = csv_score) |>
    # reorder so that `id` is in the first column
    select(id, composer, year_born, year_died, title, performer, path)

  list(perfs = tbl_perfs, scores = tbl_scores)
}

#' You may try to load the whole catalog or you may try to load a subset of it.
#' At the time of writing this I'm not sure whether the whole dataset will fit.
#' And even if it does, it may be too slow or too much. So we shall let the user
#' decide what to load.
#' Note: you may join the results of this function together using `bind_rows`.
#'   Just plop the result of the function into `bind_rows` and you're golden.
#'
#' @param df all or part of the `perfs` or `scores` dataframe.
#' @return one song `tibble` per row in `df`. We have joined each row with `df`
#'  so that they carry the `id', `composer`, `year_born`, `year_died`, `title` and
#'  `performer` (if a performance) in addition to the music variables.
load_music <- function(df) {
  pmap(df, function(id, path, ...) {
    path = file.path(get_asap_root(), path)
    tbl_song <- read_csv(path, show_col_types = FALSE)
    # first, we are going to dig up the ticksPerQuarter from within the song.
    # I didn't include it as a variable, cuz it's not really a music variable.
    # A bigger reason I didn't include it as a variable is size. The catalog is
    # getting chunky. But it's in there as a row. Let's get him 'cuz it's
    # important metadata if one is going to do music math with ticks.
    ticks_per_quarter <- tbl_song |>
      filter(type == "ticks_per_quarter") |>
      select(value_raw) |>
      mutate(value_raw = as.integer(value_raw))
    # now we can load the music
    tbl_song |>
      filter(type == "note") |>
      mutate(
        id = id,
        note = parse_integer(str_match(value_raw, "([0-9]+)")[, 2]),
        velocity = parse_integer(str_match(value_raw, ":([0-9]+)")[, 2]),
        ticks_per_quarter = ticks_per_quarter$value_raw
      ) |>
      inner_join(df, by = "id") |>
      select(id, composer:title, performer, type, tick_offset, tick_length,
        note, velocity, value_pretty:key_signature, ticks_per_quarter)
  })
}

#' Give us the `perfs` or `scores` dataframe. Or give us part of it.
#' We will do the filtering and return the dataframes you are looking for...
#' fingers crossed :).
#'
#' @param df the `perfs` or `scores` dataframe.
#' @param composer the composer to filter by.
#' @return see `load_music` for return information.
load_music_by_composer <- function(df, composer) {
  df |>
    filter(composer == composer) |>
    load_music()
}

#' Give us the `perfs` or `scores` dataframe. Or give us part of it.
#' We will do the filtering and return the dataframes you are looking for...
#' hopefully :(.
#'
#' @param df the `perfs` or `scores` dataframe.
#' @param title the title of the song to filter by.
#' @return see `load_music` for return information.
load_music_by_title <- function(df, title) {
  df |>
    filter(title == title) |>
    load_music()
}

#' Give us the whole `perfs` dataframe and cross your fingers, or give us part
#' of it. We will do the filtering and return the dataframes you are looking for.
#'
#' @param df the `perfs` dataframe.
#' @param performer the performer to filter by.
#' @return see `load_music` for return information.
load_music_by_performer <- function(df, performer) {
  df |>
    filter(performer == performer) |>
    load_music()
}

