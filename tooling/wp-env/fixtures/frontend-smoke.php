<?php
/**
 * Writes published state for the frontend smoke checks (BWB-044). Run: wp eval-file frontend-smoke.php <post_id> <step>.
 * Steps: working (draft-only streams), publish1, publish2, break (delete the published layout snapshot).
 * Not part of the distributed plugin.
 */

use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Storage\WpdbDatabase;

global $wpdb;
$post_id = (int) ( $args[0] ?? 0 );
$step    = (string) ( $args[1] ?? '' );
$db      = new WpdbDatabase( $wpdb );
$streams = new StreamStore( $db );
$snaps   = new SnapshotStore( $db, $streams );

$layout  = static fn ( int $n, string $color ): string => wp_json_encode(
	[
		'schemaVersion'  => 1,
		'documentId'     => 'doc-front',
		'layoutRevision' => $n,
		'root'           => [
			[
				'id'       => 'el-panels',
				'type'     => 'blixis/resizable-panels',
				'props'    => (object) [
					'orientation'  => 'horizontal',
					'minPanelSize' => 20,
				],
				'children' => [
					[
						'id'       => 'el-001',
						'type'     => 'blixis/heading',
						'props'    => new stdClass(),
						'children' => [],
						'style'    => [ [ 'declarations' => [ 'color' => $color ] ] ],
					],
					[
						'id'       => 'el-002',
						'type'     => 'blixis/text',
						'props'    => (object) [ 'text' => 'Second panel' ],
						'children' => [],
					],
				],
			],
			[
				'id'       => 'el-marquee',
				'type'     => 'blixis/marquee-layout',
				'props'    => (object) [
					'direction' => 'left',
					'duration'  => 30,
				],
				'children' => [
					[
						'id'       => 'el-003',
						'type'     => 'blixis/text',
						'props'    => (object) [ 'text' => 'Moving ticker' ],
						'children' => [],
					],
				],
			],
		],
	]
);
$content = static fn ( int $n, string $text ): string => wp_json_encode(
	[
		'schemaVersion'   => 1,
		'contentRevision' => $n,
		'entries'         => [
			'el-001' => [
				'status' => 'translated',
				'values' => [ 'text' => $text ],
			],
			'el-003' => [
				'status' => 'translated',
				'values' => [ 'text' => 'Moving ticker' ],
			],
		],
	]
);
$locale  = get_locale();

if ( 'working' === $step ) {
	$streams->write( $post_id, MetaKeys::LAYOUT, $layout( 1, 'green' ), 0 );
	$streams->write( $post_id, MetaKeys::content( $locale ), $content( 1, 'DRAFT-SECRET' ), 0 );
} elseif ( 'publish1' === $step || 'publish2' === $step ) {
	$n = 'publish1' === $step ? 1 : 2;
	$db->insert( $post_id, MetaKeys::snap_content( $locale, $n ), $content( $n, 1 === $n ? 'Published one' : 'Published two' ) );
	$pointer = wp_json_encode(
		[
			'schemaVersion'           => 1,
			'pointerRevision'         => 1,
			'publishedLayoutRevision' => $n,
			'defaultLocale'           => $locale,
			'locales'                 => [
				$locale => [
					'contentSnapshot' => $n,
					'baseLayout'      => $n,
				],
			],
		]
	);
	$result  = $snaps->publish( $post_id, MetaKeys::snap_layout( $n ), $layout( $n, 1 === $n ? 'red' : 'blue' ), $n - 1, $pointer );
	echo $result->success ? 'published' : 'conflict';
} elseif ( 'break' === $step ) {
	$rows = $db->rows( $post_id, MetaKeys::snap_layout( 2 ) );
	echo $rows && $db->delete( $post_id, MetaKeys::snap_layout( 2 ), $rows[0]['id'] ) ? 'broken' : 'nothing';
}
