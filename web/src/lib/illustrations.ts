/**
 * Köhler's Medizinal-Pflanzen illustration mapping.
 * Maps plant slug → local illustration path (from /public/illustrations/).
 * Source: Köhler's Medizinal-Pflanzen (1887), public domain.
 *
 * 42 plants have local high-res illustrations; remaining plants
 * fall back to Wikimedia Commons Special:FilePath URLs.
 */
export const PLANT_ILLUSTRATIONS: Record<string, string> = {
  // Local illustrations (58 JPGs in /public/illustrations/)
  "arnica": "/illustrations/Arnica_montana.jpg",
  "calendula": "/illustrations/Calendula_officinalis.jpg",
  "caraway": "/illustrations/Carum_carvi.jpg",
  "cardamom": "/illustrations/Elettaria_cardamomum.jpg",
  "castor-oil": "/illustrations/Ricinus_communis.jpg",
  "cayenne-capsicum": "/illustrations/Capsicum_annuum.jpg",
  "chamomile": "/illustrations/Matricaria_chamomilla.jpg",
  "cinchona-bark": "/illustrations/Cinchona_calisaya.jpg",
  "cinnamon": "/illustrations/Cinnamomum_verum.jpg",
  "clove": "/illustrations/Syzygium_aromaticum.jpg",
  "coltsfoot": "/illustrations/Tussilago_farfara.jpg",
  "comfrey": "/illustrations/Symphytum_officinale.jpg",
  "coriander": "/illustrations/Coriandrum_sativum.jpg",
  "dandelion": "/illustrations/Taraxacum_officinale.jpg",
  "dong-quai": "/illustrations/Angelica_archangelica.jpg",
  "elder-flower": "/illustrations/Sambucus_nigra.jpg",
  "elecampane": "/illustrations/Inula_helenium.jpg",
  "eucalyptus": "/illustrations/Eucalyptus_globulus.jpg",
  "fennel": "/illustrations/Foeniculum_vulgare.jpg",
  "fenugreek": "/illustrations/Trigonella_foenum-graecum.jpg",
  "feverfew": "/illustrations/Tanacetum_parthenium.jpg",
  "gentian": "/illustrations/Gentiana_lutea.jpg",
  "ginger": "/illustrations/Zingiber_officinale.jpg",
  "goldenseal": "/illustrations/Hydrastis_canadensis.jpg",
  "hops": "/illustrations/Humulus_lupulus.jpg",
  "juniper": "/illustrations/Juniperus_communis.jpg",
  "lavender": "/illustrations/Lavandula_angustifolia.jpg",
  "lemon-balm": "/illustrations/Melissa_officinalis.jpg",
  "licorice": "/illustrations/Glycyrrhiza_glabra.jpg",
  "linden-lime-flower": "/illustrations/Tilia_cordata.jpg",
  "marshmallow": "/illustrations/Althaea_officinalis.jpg",
  "peppermint": "/illustrations/Mentha_piperita.jpg",
  "pomegranate": "/illustrations/Punica_granatum.jpg",
  "rosemary": "/illustrations/Rosmarinus_officinalis.jpg",
  "sage": "/illustrations/Salvia_officinalis.jpg",
  "senna": "/illustrations/Cassia_angustifolia.jpg",
  "st-john-s-wort": "/illustrations/Hypericum_perforatum.jpg",
  "thyme": "/illustrations/Thymus_vulgaris.jpg",
  "turmeric": "/illustrations/Curcuma_longa.jpg",
  "valerian": "/illustrations/Valeriana_officinalis.jpg",
  "witch-hazel": "/illustrations/Hamamelis_virginiana.jpg",
  "wormwood": "/illustrations/Artemisia_absinthium.jpg",
  "yarrow": "/illustrations/Achillea_millefolium.jpg",

  // Wikimedia Commons fallbacks (no local illustration available)
  "asafoetida": "https://commons.wikimedia.org/wiki/Special:FilePath/Ferula%20assa-foetida%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-061.jpg?width=400",
  "astragalus": "https://commons.wikimedia.org/wiki/Special:FilePath/Astragalus%20brachycalyx%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-166.jpg?width=400",
  "corn-silk": "https://commons.wikimedia.org/wiki/Special:FilePath/Zea%20mays%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-283.jpg?width=400",
  "cumin": "https://commons.wikimedia.org/wiki/Special:FilePath/Cuminum%20cyminum%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-198.jpg?width=400",
  "lobelia": "https://commons.wikimedia.org/wiki/Special:FilePath/Lobelia%20inflata%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-218.jpg?width=400",
  "mugwort": "https://commons.wikimedia.org/wiki/Special:FilePath/Artemisia%20absinthium%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-164.jpg?width=400",
  "mullein": "https://commons.wikimedia.org/wiki/Special:FilePath/Verbascum%20phlomoides%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-144.jpg?width=400",
  "olive-leaf": "https://commons.wikimedia.org/wiki/Special:FilePath/Olea%20europaea%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-229.jpg?width=400",
  "parsley": "https://commons.wikimedia.org/wiki/Special:FilePath/Petroselinum%20crispum%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-103.jpg?width=400",
  "saffron": "https://commons.wikimedia.org/wiki/Special:FilePath/Crocus%20sativus%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-194.jpg?width=400",
  "tea-tree-oil": "https://commons.wikimedia.org/wiki/Special:FilePath/Melaleuca%20leucadendra%20-%20K%C3%B6hler%E2%80%93s%20Medizinal-Pflanzen-092.jpg?width=400",
};
