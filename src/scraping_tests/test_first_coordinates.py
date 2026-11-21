"""Premier point d'une trace KML (analyze_functions.get_first_coordinates), format des KML Syride."""

import analyze_functions

KML_SYRIDE = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
	<name>Flight of test
 recorded with Syride </name>
	<Style id="redline">
	<LineStyle><color>7f0000FF</color><width>6</width></LineStyle>
	</Style>
	<Placemark>
	<styleUrl>#redline</styleUrl>
	<LineString>
	<altitudeMode>absolute</altitudeMode>
	<coordinates>
1.250000,44.500000,136
1.250100,44.500100,137
</coordinates>
	</LineString>
	</Placemark>
</Document>
</kml>
"""


def test_kml_syride_premier_point(tmp_path):
    f = tmp_path / "123.kml"
    f.write_text(KML_SYRIDE, encoding="utf-8")
    assert analyze_functions.get_first_coordinates(str(f)) == [1.25, 44.5]


def test_kml_illisible_renvoie_zero(tmp_path):
    f = tmp_path / "456.kml"
    f.write_text("pas du xml", encoding="utf-8")
    assert analyze_functions.get_first_coordinates(str(f)) == [0.0, 0.0]


def test_kml_sans_coordonnees_renvoie_zero(tmp_path):
    f = tmp_path / "789.kml"
    f.write_text('<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark/></Document></kml>',
                 encoding="utf-8")
    assert analyze_functions.get_first_coordinates(str(f)) == [0.0, 0.0]
