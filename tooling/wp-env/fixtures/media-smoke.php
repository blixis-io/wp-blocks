<?php
/**
 * Creates a raster image attachment (large enough for responsive sizes) and an SVG attachment; prints their IDs as JSON.
 * Not part of the distributed plugin.
 */

require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/file.php';

$uploads = wp_upload_dir();
$png     = $uploads['path'] . '/blx-smoke-' . wp_generate_password( 6, false ) . '.png';
$image   = imagecreatetruecolor( 1200, 800 );
imagepng( $image, $png );
$raster = wp_insert_attachment(
	[
		'post_mime_type' => 'image/png',
		'post_title'     => 'Smoke image',
		'post_status'    => 'inherit',
	],
	$png
);
wp_update_attachment_metadata( $raster, wp_generate_attachment_metadata( $raster, $png ) );
update_post_meta( $raster, '_wp_attachment_image_alt', 'Smoke alt' );

$svg_path = $uploads['path'] . '/blx-smoke-' . wp_generate_password( 6, false ) . '.svg';
file_put_contents( $svg_path, '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>' ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents -- Smoke fixture.
$svg = wp_insert_attachment(
	[
		'post_mime_type' => 'image/svg+xml',
		'post_title'     => 'Smoke svg',
		'post_status'    => 'inherit',
	],
	$svg_path
);
echo wp_json_encode(
	[
		'raster' => $raster,
		'svg'    => $svg,
	]
);
