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
			[
				'id'       => 'el-syntax',
				'type'     => 'blixis/syntax-highlighter',
				'props'    => (object) [
					'code'     => 'const safe = "<script>";',
					'language' => 'js',
				],
				'children' => [],
			],
			[
				'id'       => 'el-countdown',
				'type'     => 'blixis/countdown',
				'props'    => (object) [ 'targetISO' => '2099-12-31T00:00:00Z' ],
				'children' => [],
			],
			[
				'id'       => 'el-tooltip',
				'type'     => 'blixis/tooltip-text',
				'props'    => (object) [
					'content' => 'Tooltip trigger',
					'tooltip' => 'Extra information',
				],
				'children' => [],
			],
			[
				'id'       => 'el-gradient',
				'type'     => 'blixis/gradient-text',
				'props'    => (object) [ 'content' => 'Gradient text' ],
				'children' => [],
			],
			[
				'id'       => 'el-headline',
				'type'     => 'blixis/animated-headline',
				'props'    => (object) [ 'content' => 'Text content' ],
				'children' => [],
			],
			[
				'id'       => 'el-number-ticker',
				'type'     => 'blixis/number-ticker',
				'props'    => (object) [ 'value' => 1250, 'prefix' => '$', 'suffix' => ' USD', 'durationMs' => 1500 ],
				'children' => [],
			],
			[
				'id'       => 'el-show-more',
				'type'     => 'blixis/show-more',
				'props'    => (object) [ 'label' => 'Show more', 'defaultOpen' => false ],
				'children' => [
					[
						'id'       => 'el-show-more-copy',
						'type'     => 'blixis/text',
						'props'    => (object) [ 'text' => 'Extra published content' ],
						'children' => [],
					],
				],
			],
			[
				'id'       => 'el-icon-svg',
				'type'     => 'blixis/icon-svg',
				'props'    => (object) [
					'icon'       => 'solar:info-circle-linear',
					'size'       => 48,
					'decorative' => true,
				],
				'children' => [],
			],
			[
				'id'       => 'el-site-title',
				'type'     => 'blixis/site-title',
				'props'    => (object) [ 'content' => 'Fallback site name' ],
				'children' => [],
			],
			[
				'id'       => 'el-tabs',
				'type'     => 'blixis/tabs',
				'props'    => (object) [
					'defaultValue' => 'details',
					'items'        => [
						[
							'id'      => 'overview',
							'label'   => 'Overview',
							'content' => 'Overview panel',
						],
						[
							'id'      => 'details',
							'label'   => 'Details',
							'content' => 'Details panel',
						],
					],
				],
				'children' => [],
			],
			[
				'id'       => 'el-accordion',
				'type'     => 'blixis/accordion',
				'props'    => (object) [
					'items' => [
						[
							'id'      => 'one',
							'title'   => 'First item',
							'content' => 'First answer',
						],
						[
							'id'      => 'two',
							'title'   => 'Second item',
							'content' => 'Second answer',
						],
					],
				],
				'children' => [],
			],
			[
				'id'       => 'el-offcanvas',
				'type'     => 'blixis/offcanvas',
				'props'    => (object) [
					'modal'        => true,
					'placement'    => 'left',
					'triggerLabel' => 'Open panel',
				],
				'children' => [
					[
						'id'       => 'el-offcanvas-copy',
						'type'     => 'blixis/paragraph',
						'props'    => (object) [ 'content' => 'Panel content' ],
						'children' => [],
					],
				],
			],
			[
				'id'       => 'el-switch',
				'type'     => 'blixis/switch',
				'props'    => (object) [
					'label'   => 'Enable updates',
					'checked' => true,
				],
				'children' => [],
			],
			[
				'id'       => 'el-email-field',
				'type'     => 'blixis/email-field',
				'props'    => (object) [
					'name'         => 'smoke_email',
				'label'        => 'Contact email',
				'placeholder'  => 'name@example.test',
				'autocomplete' => 'email',
				'required'     => true,
				'value'        => '',
				'validation'   => (object) [ 'maxLength' => 120 ],
				],
				'children' => [],
			],
			[
				'id'       => 'el-site-search',
				'type'     => 'blixis/site-search',
				'props'    => (object) [ 'ariaLabel' => 'Search this site' ],
				'children' => [],
			],
			[
				'id'       => 'el-range-pair',
				'type'     => 'blixis/range-slider',
				'props'    => (object) [
					'name'         => 'price',
					'defaultValue' => 20,
					'upperValue'   => 80,
				],
				'children' => [],
			],
			[
				'id'       => 'el-calendar',
				'type'     => 'blixis/calendar',
				'props'    => (object) [
					'mode'          => 'multiple',
					'locale'        => 'en-US',
					'maxSelections' => 2,
				],
				'children' => [],
			],
			[
				'id'       => 'el-data-table',
				'type'     => 'blixis/sortable-table',
				'props'    => (object) [
					'ariaLabel' => 'Scores',
					'columns'   => [
						[
							'key'   => 'name',
							'title' => 'Name',
						],
					],
					'rows'      => [ [ 'name' => 'Ada' ] ],
				],
				'children' => [],
			],
			[
				'id'       => 'el-chart',
				'type'     => 'blixis/chart',
				'props'    => (object) [
					'ariaLabel' => 'Visits',
					'data'      => [
						[
							'name'  => 'Home',
							'value' => 10,
						],
					],
				],
				'children' => [],
			],
			[
				'id'       => 'el-toast',
				'type'     => 'blixis/toast',
				'props'    => (object) [
					'title'       => 'Saved',
					'dismissible' => true,
				],
				'children' => [],
			],
			[
				'id'       => 'el-command-palette',
				'type'     => 'blixis/command-palette',
				'props'    => (object) [
					'items' => [
						[
							'label' => 'Home',
							'href'  => '/',
						],
					],
				],
				'children' => [],
			],
			[
				'id'       => 'el-carousel',
				'type'     => 'blixis/carousel',
				'props'    => (object) [
					'arrows' => true,
					'dots'   => true,
				],
				'children' => [
					[
						'id'       => 'el-carousel-one',
						'type'     => 'blixis/text',
						'props'    => (object) [ 'content' => 'First slide' ],
						'children' => [],
					],
					[
						'id'       => 'el-carousel-two',
						'type'     => 'blixis/text',
						'props'    => (object) [ 'content' => 'Second slide' ],
						'children' => [],
					],
				],
			],
			[
				'id'       => 'el-scroll-indicator',
				'type'     => 'blixis/scroll-indicator',
				'props'    => (object) [
					'ariaLabel' => 'Reading progress',
					'showLabel' => true,
				],
				'children' => [],
			],
			[
				'id'       => 'el-copy-button',
				'type'     => 'blixis/copy-button',
				'props'    => (object) [
					'label'    => 'Copy',
					'copyText' => 'Safe text',
				],
				'children' => [],
			],
			[
				'id'       => 'el-loading-button',
				'type'     => 'blixis/loading-button',
				'props'    => (object) [
					'label'        => 'Send',
					'loadingLabel' => 'Sending…',
				],
				'children' => [],
			],
			[
				'id'       => 'el-context-menu',
				'type'     => 'blixis/context-menu',
				'props'    => (object) [
					'items' => [
						[
							'label' => 'Open',
							'href'  => '/',
						],
					],
				],
				'children' => [],
			],
			[
				'id'       => 'el-query-loop',
				'type'     => 'blixis/query-loop',
				'props'    => (object) [
					'allowedPostTypes' => [ 'post' ],
					'maxItems'         => 3,
				],
				'children' => [],
			],
			[
				'id'       => 'el-dynamic-title',
				'type'     => 'blixis/post-title',
				'props'    => (object) [ 'fallback' => 'Title fallback' ],
				'children' => [],
			],
			[
				'id'       => 'el-dynamic-content',
				'type'     => 'blixis/post-content',
				'props'    => (object) [ 'fallback' => 'Content fallback' ],
				'children' => [],
			],
			[
				'id'       => 'el-bound-dynamic-tag',
				'type'     => 'blixis/dynamic-tag',
				'props'    => (object) [ 'binding' => [ 'source' => 'wordpress-post', 'path' => 'post.title' ], 'fallback' => 'Bound title fallback' ],
				'children' => [],
			],
			[
				'id'       => 'el-query-pagination',
				'type'     => 'blixis/query-pagination',
				'props'    => (object) [
					'total'       => 4,
					'currentPage' => 2,
					'basePath'    => '/',
				],
				'children' => [],
			],
			[
				'id'       => 'el-table-of-posts',
				'type'     => 'blixis/table-of-posts',
				'props'    => (object) [
					'columns' => [
						[
							'key'   => 'title',
							'title' => 'Post title',
						],
					],
					'rows'    => [ [ 'title' => 'Smoke post title' ] ],
				],
				'children' => [],
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
