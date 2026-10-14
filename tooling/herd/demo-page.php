<?php
/**
 * Publishes a demo page built from builder documents on the Herd dev site, so the stored-and-rendered pipeline can be seen in
 * a browser before the editor exists (P5). Idempotent: running it again publishes a new revision of the same page.
 * Run: wp eval-file tooling/herd/demo-page.php   (see `pnpm dev:demo`). Development only.
 */

use Blixis\Builder\Css\Compiler;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WpdbDatabase;

if ( ! class_exists( StreamStore::class ) ) {
	WP_CLI::error( 'Activate the blixis-builder plugin first.' );
}
require_once ABSPATH . 'wp-admin/includes/image.php';

global $wpdb;
$db      = new WpdbDatabase( $wpdb );
$streams = new StreamStore( $db );
$snaps   = new SnapshotStore( $db, $streams );
$locale  = get_locale();

// The page.
$found   = get_posts(
	[
		'post_type'   => 'page',
		'name'        => 'builder-demo',
		'post_status' => 'any',
		'numberposts' => 1,
	]
);
$page_id = $found ? $found[0]->ID : wp_insert_post(
	[
		'post_type'    => 'page',
		'post_title'   => 'Builder demo',
		'post_name'    => 'builder-demo',
		'post_status'  => 'publish',
		'post_content' => 'This is the normal WordPress content. If you see this text, no builder revision is published for this page.',
	]
);

// A generated image in the media library (once).
$image_id = (int) get_option( 'blixis_demo_image', 0 );
if ( $image_id < 1 || ! get_post( $image_id ) ) {
	$uploads = wp_upload_dir();
	$file    = $uploads['path'] . '/blixis-demo.png';
	$canvas  = imagecreatetruecolor( 1200, 600 );
	for ( $x = 0; $x < 1200; $x += 4 ) {
		$color = imagecolorallocate( $canvas, 30 + (int) ( $x / 8 ), 90 + (int) ( $x / 12 ), 220 - (int) ( $x / 10 ) );
		imagefilledrectangle( $canvas, $x, 0, $x + 3, 599, $color );
	}
	imagepng( $canvas, $file );
	$image_id = wp_insert_attachment(
		[
			'post_mime_type' => 'image/png',
			'post_title'     => 'Builder demo image',
			'post_status'    => 'inherit',
		],
		$file
	);
	wp_update_attachment_metadata( $image_id, wp_generate_attachment_metadata( $image_id, $file ) );
	update_post_meta( $image_id, '_wp_attachment_image_alt', 'A blue gradient generated for the demo' );
	update_option( 'blixis_demo_image', $image_id, false );
}

$rule = static fn ( array $declarations, array $extra = [] ): array => array_merge( [ 'declarations' => $declarations ], $extra );
$el   = static fn ( string $id, string $type, array $props = [], array $children = [], array $style = [] ): array => [
	'id'       => $id,
	'type'     => $type,
	'props'    => (object) $props,
	'children' => $children,
	'style'    => $style,
];

$layout = static function ( int $revision ) use ( $el, $rule, $image_id ): array {
	return [
		'schemaVersion'  => 1,
		'documentId'     => 'doc-demo',
		'layoutRevision' => $revision,
		'root'           => [
			$el(
				'hero-01',
				'blixis/section',
				[ 'tag' => 'header' ],
				[
					$el(
						'hero-con',
						'blixis/container',
						[ 'maxWidth' => 'default' ],
						[
							$el(
								'hero-h1',
								'blixis/heading',
								[ 'level' => 1 ],
								[],
								[
									$rule(
										[
											'font-size'   => '2.75rem',
											'line-height' => '1.15',
											'margin'      => '0',
										]
									),
									$rule( [ 'font-size' => '1.9rem' ], [ 'breakpoint' => 'mobile' ] ),
								]
							),
							$el(
								'hero-txt',
								'blixis/text',
								[],
								[],
								[
									$rule(
										[
											'font-size' => '1.2rem',
											'color'     => 'var(--blx-color-muted)',
											'margin'    => '1rem 0 1.5rem',
										]
									),
								]
							),
							$el(
								'hero-btn',
								'blixis/button',
								[ 'variant' => 'solid' ],
								[],
								[
									$rule(
										[
											'background-color' => 'var(--blx-color-primary)',
											'color'            => 'var(--blx-color-on-primary)',
											'padding'          => '0.75rem 1.5rem',
											'border-radius'    => 'var(--blx-radius-md)',
											'display'          => 'inline-block',
										]
									),
									$rule( [ 'opacity' => '0.85' ], [ 'state' => 'hover' ] ),
								]
							),
						],
						[ $rule( [ 'text-align' => 'center' ] ) ]
					),
				],
				[
					$rule(
						[
							'padding'          => '4rem 1rem',
							'background-color' => 'var(--blx-color-surface)',
						]
					),
					$rule( [ 'padding' => '2.5rem 1rem' ], [ 'breakpoint' => 'mobile' ] ),
				]
			),
			$el(
				'body-01',
				'blixis/section',
				[ 'tag' => 'main' ],
				[
					$el(
						'body-con',
						'blixis/container',
						[ 'maxWidth' => 'default' ],
						[
							$el( 'body-h2', 'blixis/heading', [ 'level' => 2 ] ),
							$el( 'body-txt', 'blixis/text' ),
							$el(
								'body-img',
								'blixis/image',
								[ 'attachmentId' => $image_id ],
								[],
								[
									$rule(
										[
											'max-width'     => '100%',
											'height'        => 'auto',
											'border-radius' => 'var(--blx-radius-md)',
										]
									),
								]
							),
						]
					),
				],
				[ $rule( [ 'padding' => '3rem 1rem' ] ) ]
			),
		],
	];
};

$entries = static fn ( array $texts ): array => [
	'hero-h1'  => [
		'status' => 'translated',
		'values' => [ 'text' => $texts['h1'] ],
	],
	'hero-txt' => [
		'status' => 'translated',
		'values' => [ 'text' => $texts['lead'] ],
	],
	'hero-btn' => [
		'status' => 'translated',
		'values' => [
			'label' => $texts['button'],
			'href'  => '#how',
		],
	],
	'body-h2'  => [
		'status' => 'translated',
		'values' => [ 'text' => $texts['h2'] ],
	],
	'body-txt' => [
		'status' => 'translated',
		'values' => [ 'text' => $texts['body'] ],
	],
	'body-img' => [
		'status' => 'translated',
		'values' => [ 'alt' => $texts['alt'] ],
	],
];
$en      = [
	'h1'     => 'Built with the Blixis Builder',
	'lead'   => 'This page is stored as a builder document, rendered by the PHP element renderers and styled by the PHP CSS compiler.',
	'button' => 'See how it works',
	'h2'     => 'What you are looking at',
	'body'   => 'Headings, text, buttons and images come from the element registry. Colours, spacing and radius are design tokens, so changing the design system in Appearance > Blixis setup changes this page too. Try dark mode with your system setting.',
	'alt'    => 'A blue gradient generated for the demo',
];
$nl      = [
	'h1'     => 'Gebouwd met de Blixis Builder',
	'lead'   => 'Deze pagina is opgeslagen als builder-document en gerenderd door de PHP-elementrenderers.',
	'button' => 'Bekijk hoe het werkt',
	'h2'     => 'Wat je hier ziet',
	'body'   => 'Koppen, tekst, knoppen en afbeeldingen komen uit het elementenregister.',
	'alt'    => 'Een blauwe kleurverloop voor de demo',
];

// Next snapshot number: one above anything stored for this post.
$numbers = array_map( static fn ( string $key ): int => (int) substr( $key, (int) strrpos( $key, '_' ) + 1 ), $db->snapshot_keys( $page_id ) );
$n       = ( [] === $numbers ? 0 : max( $numbers ) ) + 1;

$content_json = static fn ( int $rev, array $texts ): string => wp_json_encode(
	[
		'schemaVersion'   => 1,
		'contentRevision' => $rev,
		'entries'         => $entries( $texts ),
	]
);
$db->insert( $page_id, MetaKeys::snap_content( 'en_US', $n ), $content_json( $n, $en ) );
$db->insert( $page_id, MetaKeys::snap_content( 'nl_NL', $n ), $content_json( $n, $nl ) );

$document = $layout( $n );
$compiled = Compiler::compile( json_decode( wp_json_encode( $document ) ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Dev script.
foreach ( $compiled->issues as $issue ) {
	WP_CLI::warning( $issue['code'] . ' at ' . $issue['path'] . ': ' . $issue['message'] );
}

$current  = $streams->read( $page_id, MetaKeys::PUBLISHED );
$expected = $current ? $current['revision'] : 0;
$pointer  = wp_json_encode(
	[
		'schemaVersion'           => 1,
		'pointerRevision'         => 1,
		'publishedLayoutRevision' => $n,
		'defaultLocale'           => 'en_US',
		'locales'                 => [
			'en_US' => [
				'contentSnapshot' => $n,
				'baseLayout'      => $n,
			],
			'nl_NL' => [
				'contentSnapshot' => $n,
				'baseLayout'      => $n,
			],
		],
	]
);
$result   = $snaps->publish( $page_id, MetaKeys::snap_layout( $n ), wp_json_encode( $document ), $expected, $pointer );
if ( ! $result->success ) {
	WP_CLI::error( 'Publishing conflicted; run the script again.' );
}
WP_CLI::success( sprintf( 'Published revision %d of "%s": %s (site locale %s, %d CSS issues)', $n, get_the_title( $page_id ), get_permalink( $page_id ), $locale, count( $compiled->issues ) ) );
