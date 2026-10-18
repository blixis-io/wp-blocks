<?php
/**
 * Publish and rollback tests (ADR 0004 test strategy).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Frontend\PublishedReader;
use Blixis\Builder\Publication\PublishOptions;
use Blixis\Builder\Publication\Publisher;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\SnapshotStore;
use Blixis\Builder\Storage\StreamStore;
use Blixis\Builder\Preview\PreviewDocument;
use Blixis\Builder\Render\CoreDocumentRenderer;
use Blixis\Builder\Render\MediaResolver;
use Blixis\Builder\Templates\Importer;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();

/** Locale and layout publication move one pointer atomically and never publish working data by accident. */
final class PublisherTest extends TestCase {
	/**
	 * Storage.
	 *
	 * @var FakeDatabase
	 */
	private FakeDatabase $database;

	/**
	 * Working streams.
	 *
	 * @var StreamStore
	 */
	private StreamStore $streams;

	/**
	 * Publisher under test.
	 *
	 * @var Publisher
	 */
	private Publisher $publisher;

	/** Fresh storage. */
	protected function setUp(): void {
		$this->database  = new FakeDatabase();
		$this->streams   = new StreamStore( $this->database );
		$this->publisher = new Publisher( $this->database, $this->streams, new SnapshotStore( $this->database, $this->streams ), ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' ) );
	}

	/** Business pack v2 element types survive the same snapshot publication and read path as imported pages. */
	public function test_business_pack_layout_round_trips_through_publisher_and_published_reader(): void {
		$pack = \json_decode( (string) \file_get_contents( \dirname( __DIR__ ) . '/templates/packs/business/template.json' ) );
		$this->assertInstanceOf( \stdClass::class, $pack );
		$root   = $pack->documents[0]->root;
		$layout = [
			'schemaVersion'  => 1,
			'documentId'     => 'business-home',
			'layoutRevision' => 1,
			'root'           => [ $root ],
		];
		$this->assertTrue( $this->streams->write( 5, MetaKeys::LAYOUT, (string) \json_encode( $layout, JSON_THROW_ON_ERROR ), 0 )->success );
		$this->assertTrue( $this->streams->write( 5, MetaKeys::content( 'en_US' ), '{"schemaVersion":1,"contentRevision":1,"entries":{}}', 0 )->success );
		$result = $this->publisher->publish( 5, new PublishOptions( 0, true, 'en_US' ) );
		$this->assertNull( $result->code, $result->code ?? '' );
		$published = ( new PublishedReader( $this->database ) )->read( 5, 'en_US' );
		$this->assertNotNull( $published );
		$this->assertTrue( PreviewDocument::accepts( $published->document ) );
		$this->assertSame( 'page', $published->document->root[0]->type );
	}

	/** Imported bundled-pack copy survives the exact stream, publication, read and render path. */
	public function test_imported_template_localizable_content_renders_for_all_critical_packs(): void {
		$definitions = \Blixis\Builder\Registry\ElementDefinitionRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/element-definitions-v2.json' );
		$registry    = ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' );
		$media       = new class() implements MediaResolver {
			/** Resolve a stored media id.
			 *
			 * @param int $attachment_id Attachment identifier.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null; }
		};
		$renderer    = new CoreDocumentRenderer( $registry, $media );
		foreach ( [ 'business', 'creative-agency', 'modern-homes', 'online-store' ] as $index => $pack_id ) {
			$pack = json_decode( (string) file_get_contents( __DIR__ . '/../templates/packs/' . $pack_id . '/template.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bundled pack fixture.
			$this->assertIsArray( $pack );
			$root    = $pack['documents'][0]['root'];
			$notes   = [];
			$streams = Importer::document_streams( $root, $definitions, 'en_US', $notes, $pack['designTokens']['colors']['light'] );
			$entries = get_object_vars( $streams['content']['entries'] );
			$this->assertArrayHasKey( 'hero-title', $entries, $pack_id );
			$this->assertArrayHasKey( 'content', get_object_vars( $entries['hero-title']['values'] ), $pack_id );
			$this->assertArrayHasKey( 'items', get_object_vars( $entries['primary-nav']['values'] ), $pack_id . ' localized navigation labels' );
			$post_id = 100 + $index;
			$this->assertArrayNotHasKey( 'content', $streams['layout']['root'][0]['props'], $pack_id . ' layout excludes localized content' );
			$this->assertTrue( $this->streams->write( $post_id, MetaKeys::LAYOUT, (string) json_encode( $streams['layout'] ), 0 )->success, $pack_id );
			$this->assertTrue( $this->streams->write( $post_id, MetaKeys::content( 'en_US' ), (string) json_encode( $streams['content'] ), 0 )->success, $pack_id );
			$result = $this->publisher->publish( $post_id, new PublishOptions( 0, true, 'en_US' ) );
			$this->assertNull( $result->code, $pack_id . ': ' . ( $result->code ?? '' ) );
			$published = ( new PublishedReader( $this->database ) )->read( $post_id, 'en_US' );
			$this->assertNotNull( $published, $pack_id );
			$html        = $renderer->render( $published->document, 'en_US', 'light', [], 'source', [ 'primary' ] );
			$title       = $this->template_plain_text( $pack['documents'][0]['root'], 'hero-title' );
			$description = $this->template_plain_text( $pack['documents'][0]['root'], 'hero-description' );
			$this->assertNotSame( '', $title, $pack_id );
			$this->assertNotSame( '', $description, $pack_id );
			$this->assertStringContainsString( $title, html_entity_decode( strip_tags( preg_replace( '/<span[^>]*>|<\\/span>/', '', $html ) ?? $html ) ), $pack_id . ' hero title' );
			$this->assertStringContainsString( $description, html_entity_decode( strip_tags( $html ) ), $pack_id . ' hero description' );
			if ( 'online-store' === $pack_id ) {
				$this->assertStringContainsString( 'data-blx-unsupported', $html, 'deferred commerce renderer uses the safe fallback' );
				$this->assertStringContainsString( 'data-blx-type="woocommerce-cart-link"', $html );
				$this->assertStringContainsString( 'data-blx-type="woocommerce-product-grid"', $html );
				$this->assertStringContainsString( 'data-blx-id="cart"', $html );
				$this->assertStringContainsString( 'data-blx-id="product-query"', $html );
				continue;
			}
			$this->assertStringContainsString( 'Home', html_entity_decode( strip_tags( $html ) ), $pack_id . ' navigation label' );
			if ( str_contains( (string) file_get_contents( __DIR__ . '/../templates/packs/' . $pack_id . '/template.json' ), 'token-color' ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bundled pack fixture.
				$this->assertStringContainsString( 'class="blx-mc-primary"', $html, $pack_id . ' token color' );
			}
		}
	}

	/** Business pack source and Dutch localization publish and render under their enabled WordPress locales. */
	public function test_business_template_language_codes_render_in_enabled_site_locales(): void {
		$pack = json_decode( (string) file_get_contents( __DIR__ . '/../templates/packs/business/template.json' ), true ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Bundled fixture.
		$this->assertSame( 'en', $pack['template']['defaultLocale'] );
		$this->assertSame( [ 'en', 'nl' ], $pack['template']['supportedLocales'] );
		$notes = [];
		$map   = Importer::map_template_locales( 'en', [ 'en', 'nl' ], [ 'en_US', 'nl_NL' ], 'en_US', $notes );
		$this->assertSame(
			[
				'en' => 'en_US',
				'nl' => 'nl_NL',
			],
			$map
		);
		$definitions = \Blixis\Builder\Registry\ElementDefinitionRegistry::from_manifest_file( __DIR__ . '/../data/element-definitions-v2.json' );
		$registry    = ElementRegistry::from_manifest_file( __DIR__ . '/../data/core-elements.json' );
		$media       = new class() implements MediaResolver {
			/** Resolve a stored media ID.
			 *
			 * @param int $attachment_id Attachment identifier.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}
		};
		$renderer    = new CoreDocumentRenderer( $registry, $media );
		$root        = $pack['documents'][0]['root'];
		$streams     = Importer::document_streams( $root, $definitions, $map['en'], $notes, $pack['designTokens']['colors']['light'] );
		$types       = [];
		$walk        = static function ( array $node ) use ( &$walk, &$types ): void {
			$types[ $node['id'] ] = $node['type'];
			foreach ( $node['children'] ?? [] as $child ) {
				$walk( $child );
			} };
		$walk( $pack['documents'][0]['root'] );
		$streams['nl_NL'] = Importer::localization_stream( $pack['localizations']['nl'], $types, $definitions, $map['nl'], $pack['designTokens']['colors']['light'], $notes );
		$this->assertTrue( $this->streams->write( 290, MetaKeys::LAYOUT, (string) json_encode( $streams['layout'] ), 0 )->success );
		foreach ( [ 'en_US', 'nl_NL' ] as $locale ) {
			$this->assertTrue( MetaKeys::is_valid_key( MetaKeys::content( $locale ) ) );
			$content_stream = 'en_US' === $locale ? $streams['content'] : $streams['nl_NL'];
			$this->assertTrue( $this->streams->write( 290, MetaKeys::content( $locale ), (string) json_encode( $content_stream ), 0 )->success );
			$result = $this->publisher->publish( 290, new PublishOptions( 'en_US' === $locale ? 0 : 1, true, $locale ) );
			$this->assertNull( $result->code, $result->code ?? '' );
			$published = ( new PublishedReader( $this->database ) )->read( 290, $locale );
			$this->assertNotNull( $published );
			$html = $renderer->render( $published->document, $locale, 'light', [], 'source', [ 'primary' ] );
			$this->assertStringContainsString( 'class="blx-mc-primary"', $html );
			$rendered_text = html_entity_decode( strip_tags( preg_replace( '/<span[^>]*>|<\\/span>/', '', $html ) ?? $html ) );
			if ( 'en_US' === $locale ) {
				$this->assertStringContainsString( 'Building what comes next', $rendered_text );
				$this->assertStringContainsString( 'Practical strategy, thoughtful technology, and measurable outcomes for growing organizations.', $rendered_text );
			} else {
				$this->assertStringContainsString( 'Samen bouwen aan morgen', $rendered_text );
			}
		}
	}

	/** Find a plain-text element value in a template tree.
	 *
	 * @param array<string,mixed> $node Element node.
	 * @param string              $id Element identifier.
	 */
	private function template_plain_text( array $node, string $id ): string {
		if ( ( $node['id'] ?? null ) === $id ) {
			return implode( '', array_map( static fn ( array $part ): string => is_string( $part['text'] ?? null ) ? $part['text'] : '', $node['props']['content'] ?? [] ) );
		}
		foreach ( $node['children'] ?? [] as $child ) {
			$text = $this->template_plain_text( $child, $id );
			if ( '' !== $text ) {
				return $text;
			}
		}
		return '';
	}

	/**
	 * Save the working layout.
	 *
	 * @param array<string> $ids Element ids (headings), in order.
	 * @param int           $expected Expected stream revision.
	 */
	private function save_layout( array $ids, int $expected ): void {
		$root = [];
		foreach ( $ids as $id ) {
			$root[] = [
				'id'       => $id,
				'type'     => 'blixis/heading',
				'props'    => new \stdClass(),
				'children' => [],
			];
		}
		$this->assertTrue(
			$this->streams->write(
				5,
				MetaKeys::LAYOUT,
				(string) \json_encode(
					[
						'schemaVersion'  => 1,
						'documentId'     => 'doc-001',
						'layoutRevision' => 1,
						'root'           => $root,
					]
				),
				$expected
			)->success
		);
	}

	/**
	 * Save working content of a locale.
	 *
	 * @param string               $locale Locale.
	 * @param array<string,string> $texts Element id to heading text.
	 * @param int                  $expected Expected stream revision.
	 */
	private function save_content( string $locale, array $texts, int $expected ): void {
		$entries = [];
		foreach ( $texts as $id => $text ) {
			$entries[ $id ] = [
				'status' => 'translated',
				'values' => [ 'text' => $text ],
			];
		}
		$this->assertTrue(
			$this->streams->write(
				5,
				MetaKeys::content( $locale ),
				(string) \json_encode(
					[
						'schemaVersion'   => 1,
						'contentRevision' => 1,
						'entries'         => (object) $entries,
					]
				),
				$expected
			)->success
		);
	}

	/**
	 * Publish with options.
	 *
	 * @param int     $pointer Expected pointer revision.
	 * @param bool    $layout Publish the layout.
	 * @param ?string $locale Locale.
	 * @param bool    $confirm Confirm impact.
	 * @param bool    $exclude Exclude incompatible entries.
	 */
	private function publish( int $pointer, bool $layout, ?string $locale, bool $confirm = false, bool $exclude = false ): \Blixis\Builder\Publication\PublishResult {
		return $this->publisher->publish( 5, new PublishOptions( $pointer, $layout, $locale, $confirm, $exclude, null, null, 'en_US' ) );
	}

	/**
	 * What a visitor of a locale gets, as comparable JSON.
	 *
	 * @param string $locale Locale.
	 */
	private function live( string $locale ): string {
		$published = ( new PublishedReader( $this->database ) )->read( 5, $locale );
		return null === $published ? 'none' : (string) \json_encode( [ $published->document, $published->locale, $published->layout_revision, $published->content_revision ] );
	}

	/** The locale smoke fixture shape publishes and renders legacy text values for each locale. */
	public function test_legacy_smoke_content_renders_after_publish_for_each_locale(): void {
		$layout = json_decode( '{"schemaVersion":1,"documentId":"locale-smoke","layoutRevision":1,"root":[{"id":"hed-1","type":"blixis/heading","props":{"level":2},"children":[]},{"id":"hed-2","type":"blixis/heading","props":{"level":2},"children":[]}]}' );
		$this->assertInstanceOf( \stdClass::class, $layout );
		$this->assertTrue( $this->streams->write( 5, MetaKeys::LAYOUT, json_encode( $layout, JSON_THROW_ON_ERROR ), 0 )->success );
		$rich = json_decode( '{"v":1,"inline":[{"t":"text","s":"English rich"}]}' );
		foreach ( [
			'en_US' => [
				'hed-1' => 'English hello',
				'hed-2' => $rich,
			],
			'nl_NL' => [ 'hed-1' => 'Nederlandse hallo' ],
			'ar'    => [ 'hed-1' => 'مرحبا' ],
		] as $locale => $texts ) {
			$entries = [];
			foreach ( $texts as $id => $text ) {
				$entries[ $id ] = [
					'status' => 'translated',
					'values' => [ 'text' => $text ],
				];
			}
			$body = json_encode(
				json_decode(
					json_encode(
						[
							'schemaVersion'   => 1,
							'contentRevision' => 1,
							'entries'         => (object) $entries,
						],
						JSON_THROW_ON_ERROR
					),
					false,
					512,
					JSON_THROW_ON_ERROR
				),
				JSON_THROW_ON_ERROR
			);
			$this->assertTrue( $this->streams->write( 5, MetaKeys::content( $locale ), $body, 0 )->success, $locale );
		}
		$this->assertNull( $this->publisher->publish( 5, new PublishOptions( 0, true, 'en_US' ) )->code );
		$this->assertNull( $this->publisher->publish( 5, new PublishOptions( 1, false, 'nl_NL' ) )->code );
		$this->assertNull( $this->publisher->publish( 5, new PublishOptions( 2, false, 'ar' ) )->code );
		$media    = new class() implements MediaResolver {
			/** Resolve media ids for this fixture.
			 *
			 * @param int $attachment_id Attachment id.
			 */
			public function resolve( int $attachment_id ): ?array {
				return null;
			}
		};
		$renderer = new CoreDocumentRenderer( ElementRegistry::from_manifest_file( dirname( __DIR__ ) . '/data/core-elements.json' ), $media );
		foreach ( [
			'en_US' => [ 'English hello', 'English rich' ],
			'nl_NL' => [ 'Nederlandse hallo' ],
			'ar'    => [ 'مرحبا' ],
		] as $locale => $expected ) {
			$published = ( new PublishedReader( $this->database ) )->read( 5, $locale );
			$this->assertNotNull( $published, $locale );
			$html = $renderer->render( $published->document, $locale, 'light' );
			foreach ( $expected as $text ) {
				$this->assertStringContainsString( $text, $html, $locale );
			}
		}
	}

	/** A first publication of layout and English content makes the page live; nothing is live before. */
	public function test_first_publication(): void {
		$this->save_layout( [ 'hed-1', 'hed-2' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->assertSame( 'none', $this->live( 'en_US' ), 'working data is not live' );
		$result = $this->publish( 0, true, 'en_US' );
		$this->assertNull( $result->code );
		$this->assertSame( 1, $result->data['pointerRevision'] );
		$this->assertStringContainsString( 'Hello', $this->live( 'en_US' ) );
		$status = $this->publisher->status( 5 );
		$this->assertSame( 'published', $status['layout']['state'] );
		$this->assertSame( 'published', $status['locales']['en_US']['state'] );
	}

	/** Unpublishing advances the pointer, restores the ordinary-content fallback and keeps every snapshot and working stream. */
	public function test_unpublish_retains_snapshots_and_working_streams(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->assertNull( $this->publish( 0, true, 'en_US' )->code );
		$before = $this->database->data;
		$result = $this->publisher->unpublish( 5, 1 );
		$this->assertNull( $result->code );
		$this->assertSame( 2, $result->data['pointerRevision'] );
		$this->assertSame( 'none', $this->live( 'en_US' ) );
		$status = $this->publisher->status( 5 );
		$this->assertSame( 'unpublished', $status['layout']['state'] );
		$this->assertSame( 'unpublished', $status['locales']['en_US']['state'] );
		$this->assertSame( $before[5][ MetaKeys::LAYOUT ], $this->database->data[5][ MetaKeys::LAYOUT ] );
		$this->assertSame( $before[5][ MetaKeys::content( 'en_US' ) ], $this->database->data[5][ MetaKeys::content( 'en_US' ) ] );
		$this->assertArrayHasKey( MetaKeys::snap_layout( 1 ), $this->database->data[5] );
		$this->assertArrayHasKey( MetaKeys::snap_content( 'en_US', 1 ), $this->database->data[5] );
		$this->assertSame( [ 422, 'blixis_nothing_to_publish' ], [ $this->publisher->unpublish( 5, 2 )->status, $this->publisher->unpublish( 5, 2 )->code ] );
		$this->assertNull( $this->publisher->publish( 5, new PublishOptions( 2, true, 'en_US' ) )->code );
		$this->assertNotSame( 'none', $this->live( 'en_US' ) );
	}

	/** Content rollback after unpublish restores its original layout, and reports a missing base snapshot clearly. */
	public function test_content_rollback_after_unpublish_uses_its_base_layout(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Original text' ], 0 );
		$this->assertNull( $this->publish( 0, true, 'en_US' )->code );
		$this->save_content( 'en_US', [ 'hed-1' => 'Later text' ], 1 );
		$this->assertNull( $this->publish( 1, false, 'en_US' )->code );
		$this->assertNull( $this->publisher->unpublish( 5, 2 )->code );
		$result = $this->publisher->publish( 5, new PublishOptions( 3, false, 'en_US', false, false, null, 1, 'en_US' ) );
		$this->assertNull( $result->code );
		$pointer = Envelope::decode( $this->database->data[5][ MetaKeys::PUBLISHED ][0]['value'], MetaKeys::PUBLISHED );
		$this->assertNotNull( $pointer );
		$this->assertSame( 1, $pointer->{'publishedLayoutRevision'} );
		$this->assertStringContainsString( 'Original text', $this->live( 'en_US' ) );

		$this->assertTrue( $this->database->delete( 5, MetaKeys::snap_layout( 1 ), $this->database->data[5][ MetaKeys::snap_layout( 1 ) ][0]['id'] ) );
		$missing = $this->publisher->publish( 5, new PublishOptions( 4, false, 'en_US', false, false, null, 1, 'en_US' ) );
		$this->assertSame( [ 409, 'blixis_base_layout_snapshot_missing' ], [ $missing->status, $missing->code ] );
	}

	/** Publishing Dutch with pending English edits leaves English live output byte-identical. */
	public function test_publishing_dutch_does_not_publish_pending_english(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->publish( 0, true, 'en_US' );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello EDITED' ], 1 );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Hallo' ], 0 );
		$before = $this->live( 'en_US' );
		$result = $this->publish( 1, false, 'nl_NL' );
		$this->assertNull( $result->code );
		$this->assertSame( $before, $this->live( 'en_US' ) );
		$this->assertStringContainsString( 'Hallo', $this->live( 'nl_NL' ) );
		$this->assertSame( 'published-with-pending-changes', $this->publisher->status( 5 )['locales']['en_US']['state'] );
	}

	/** Dutch published while the layout has unpublished changes uses the published layout. */
	public function test_locale_uses_the_published_layout(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->publish( 0, true, 'en_US' );
		$this->save_layout( [ 'hed-1', 'hed-2' ], 1 );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Hallo' ], 0 );
		$this->assertNull( $this->publish( 1, false, 'nl_NL' )->code );
		$this->assertStringNotContainsString( 'hed-2', $this->live( 'nl_NL' ) );
		$this->assertSame( 'published-with-pending-changes', $this->publisher->status( 5 )['layout']['state'] );
	}

	/** A locale cannot be published before any layout is published. */
	public function test_locale_needs_a_published_layout(): void {
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Hallo' ], 0 );
		$result = $this->publish( 0, false, 'nl_NL' );
		$this->assertSame( [ 409, 'blixis_layout_not_published' ], [ $result->status, $result->code ] );
	}

	/** Entries for missing elements block the publish with a list, or are excluded on request. */
	public function test_incompatible_content_is_blocked_or_excluded(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->publish( 0, true, null );
		$this->save_content(
			'nl_NL',
			[
				'hed-1'  => 'Hallo',
				'gone-1' => 'Weg',
			],
			0
		);
		$blocked = $this->publish( 1, false, 'nl_NL' );
		$this->assertSame( [ 409, 'blixis_publish_blocked' ], [ $blocked->status, $blocked->code ] );
		$this->assertSame(
			[
				[
					'id'     => 'gone-1',
					'reason' => 'missing-element',
					'locale' => 'nl_NL',
				],
			],
			$blocked->data['incompatible']
		);
		$this->assertSame( 1, $this->publisher->status( 5 )['pointerRevision'], 'a blocked publish changes nothing' );
		$excluded = $this->publish( 1, false, 'nl_NL', false, true );
		$this->assertNull( $excluded->code );
		$this->assertStringNotContainsString( 'Weg', $this->live( 'nl_NL' ) );
		$this->assertStringContainsString( 'Hallo', $this->live( 'nl_NL' ) );
	}

	/** A layout publish that breaks a published locale reports the impact and pins that locale until confirmed. */
	public function test_layout_publish_impact_and_pinning(): void {
		$this->save_layout( [ 'hed-1', 'hed-2' ], 0 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Hello' ], 0 );
		$this->save_content( 'nl_NL', [ 'hed-2' => 'Tweede' ], 0 );
		$this->publish( 0, true, 'en_US' );
		$this->publish( 1, false, 'nl_NL' );
		$this->save_layout( [ 'hed-1' ], 1 );
		$blocked = $this->publish( 2, true, null );
		$this->assertSame( 'blixis_publish_blocked', $blocked->code );
		$this->assertSame(
			[
				[
					'locale' => 'nl_NL',
					'ids'    => [ 'hed-2' ],
				],
			],
			$blocked->data['impacted']
		);
		$this->assertSame( 2, ( $this->publisher->status( 5 )['pointerRevision'] ), 'a blocked publish changes nothing' );
		$nl_before = $this->live( 'nl_NL' );
		$done      = $this->publish( 2, true, null, true );
		$this->assertNull( $done->code );
		$this->assertSame( [ 'nl_NL' ], $done->data['pinnedLocales'] );
		$this->assertSame( $nl_before, $this->live( 'nl_NL' ), 'the broken locale keeps its previous layout' );
		$this->assertStringNotContainsString( 'hed-2', $this->live( 'en_US' ), 'compatible locales move to the new layout' );
	}

	/** A stale pointer revision is a conflict and writes nothing visible. */
	public function test_pointer_conflict(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->publish( 0, true, null );
		$result = $this->publish( 0, true, null );
		$this->assertSame( [ 409, 'blixis_conflict' ], [ $result->status, $result->code ] );
		$this->assertSame( [ 1, 0 ], [ $result->data['currentRevision'], $result->data['expectedRevision'] ] );
		$this->assertSame( 1, $this->publisher->status( 5 )['pointerRevision'] );
	}

	/** Nothing to publish and invalid requests are rejected without touching the pointer. */
	public function test_invalid_requests(): void {
		$this->assertSame( 422, $this->publish( 0, false, null )->status );
		$this->assertSame( 422, $this->publish( 0, true, null )->status, 'no working layout' );
		$this->assertSame( 400, $this->publish( 0, false, 'NL;x' )->status );
		$this->assertSame( 0, $this->publisher->status( 5 )['pointerRevision'] );
	}

	/** Locale rollback restores the (base layout, content) pair exactly; layout rollback republishes an old layout. */
	public function test_rollbacks(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Een' ], 0 );
		$this->publish( 0, true, 'nl_NL' );
		$first = $this->live( 'nl_NL' );
		$this->save_content( 'nl_NL', [ 'hed-1' => 'Twee' ], 1 );
		$this->save_layout( [ 'hed-1', 'hed-2' ], 1 );
		$this->publish( 1, true, 'nl_NL' );
		$this->assertStringContainsString( 'Twee', $this->live( 'nl_NL' ) );
		$back = $this->publisher->publish( 5, new PublishOptions( 2, false, 'nl_NL', false, false, null, 1, 'en_US' ) );
		$this->assertNull( $back->code );
		$this->assertSame( 3, $back->data['contentSnapshot'], 'rollback is append-only: a new snapshot number' );
		$restored = (string) \json_decode( $this->live( 'nl_NL' ), true )[0]['root'][0]['id'];
		$this->assertSame( 'hed-1', $restored );
		$this->assertStringContainsString( 'Een', $this->live( 'nl_NL' ) );
		$this->assertStringNotContainsString( 'hed-2', $this->live( 'nl_NL' ), 'the pair returns to the layout it was published against' );
		$this->assertNotSame( 'none', $first );
		$missing = $this->publisher->publish( 5, new PublishOptions( 3, false, 'nl_NL', false, false, null, 99, 'en_US' ) );
		$this->assertSame( [ 404, 'blixis_snapshot_not_found' ], [ $missing->status, $missing->code ] );
		$layout_back = $this->publisher->publish( 5, new PublishOptions( 3, false, null, true, false, 1, null, 'en_US' ) );
		$this->assertNull( $layout_back->code );
		$this->assertSame( 3, $layout_back->data['layoutSnapshot'] );
	}

	/** Saving working data never moves the pointer (autosave never publishes). */
	public function test_working_writes_do_not_publish(): void {
		$this->save_layout( [ 'hed-1' ], 0 );
		$this->publish( 0, true, null );
		$live = $this->live( 'en_US' );
		$this->save_layout( [ 'hed-1', 'hed-9' ], 1 );
		$this->save_content( 'en_US', [ 'hed-1' => 'Draft' ], 0 );
		$this->assertSame( $live, $this->live( 'en_US' ) );
		$this->assertSame( 1, $this->publisher->status( 5 )['pointerRevision'] );
	}

	/** The request policy: capability split, strict bodies and required preconditions. */
	public function test_request_policy(): void {
		$access = new \Blixis\Builder\Rest\FakePostAccess();
		$site   = new class() implements \Blixis\Builder\Rest\SiteLocale {
			/**
			 * Fixed locale.
			 *
			 * @return string
			 */
			public function default_locale(): string {
				return 'en_US';
			}
		};
		\Blixis\Builder\Theme\ThemeCompat::reset_for_tests();
		$reader  = new class() implements \Blixis\Builder\Theme\CompatibilityReader {
			/** Fixture context. */
			public function context_key(): string {
				return 'publisher-supported';
			}
			/** Supported contract. */
			public function declared(): int {
				return 1; }
			/** Valid declaration. */
			public function invalid_declaration(): bool {
				return false; }
			/** Fixture theme. */
			public function active_theme_name(): string {
				return 'Fixture'; }
		};
		$guard   = new \Blixis\Builder\Rest\ThemeGuard( $access, new \Blixis\Builder\Theme\ThemeCompat( $reader ) );
		$request = new \Blixis\Builder\Rest\PublicationRequest( $this->publisher, $access, $site, $guard );
		$this->assertNull( $request->permission( 5, true ) );
		$access->can_publish = false;
		$this->assertNull( $request->permission( 5, false ), 'editors may read the state' );
		$denied = $request->permission( 6, true );
		$this->assertNotNull( $denied );
		$this->assertSame( 403, $denied->status, 'but not publish' );
		$access->authenticated = false;
		$anonymous             = $request->permission( 7, false );
		$this->assertNotNull( $anonymous );
		$this->assertSame( 401, $anonymous->status );
		$access->authenticated = true;
		$this->assertSame( 428, $request->publish( 5, null, '{}' )->status );
		$this->assertSame( 400, $request->publish( 5, 'x', '{}' )->status );
		foreach ( [ '{"layout":"yes"}', '{"locale":"NL;x"}', '{"evil":1}', '[true]', 'nope', \str_repeat( ' ', 600 ) . '{}', '{"layout":true,"confirmImpact":1}' ] as $bad ) {
			$this->assertSame( 422, $request->publish( 5, '"0"', $bad )->status, $bad );
		}
		foreach ( [ '{}', '{"layoutSnapshot":1,"locale":"nl_NL"}', '{"contentSnapshot":1}', '{"layoutSnapshot":0}', '{"layoutSnapshot":1,"contentSnapshot":1,"locale":"nl_NL"}' ] as $bad ) {
			$this->assertSame( 422, $request->rollback( 5, '"0"', $bad )->status, $bad );
		}
		foreach ( [ '{"locale":"client supplied"}', '{"unknown":true}' ] as $bad ) {
			$result = $request->unpublish( 5, '"0"', 0, $bad );
			$this->assertSame( [ 422, 'blixis_invalid_document' ], [ $result->status, $result->code ], $bad );
		}
		$access->can_publish = true;
		\Blixis\Builder\Theme\ThemeCompat::reset_for_tests();
		$invalid_reader = new class() implements \Blixis\Builder\Theme\CompatibilityReader {
			/** Fixture context. */
			public function context_key(): string {
				return 'publisher-invalid';
			}
			/** Invalid declaration. */
			public function declared(): ?int {
				return null;
			}
			/** Header was present. */
			public function invalid_declaration(): bool {
				return true;
			}
			/** Theme name. */
			public function active_theme_name(): string {
				return 'Fixture';
			}
		};
		$locked         = new \Blixis\Builder\Rest\PublicationRequest( $this->publisher, $access, $site, new \Blixis\Builder\Rest\ThemeGuard( $access, new \Blixis\Builder\Theme\ThemeCompat( $invalid_reader ) ) );
		$this->assertNull( $locked->permission( 5, false ) );
		$lock_result = $locked->permission( 5, true );
		$this->assertInstanceOf( \Blixis\Builder\Publication\PublishResult::class, $lock_result );
		$this->assertSame( 423, $lock_result->status );
	}
}
