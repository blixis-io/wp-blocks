<?php
/**
 * Locale-aware saving, validation and translation status tests (BWB-112).
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Tests;

use Blixis\Builder\Autoloader;
use Blixis\Builder\Locale\SourceDigest;
use Blixis\Builder\Locale\TranslationStatus;
use Blixis\Builder\Registry\ElementRegistry;
use Blixis\Builder\Rest\DocumentRequest;
use Blixis\Builder\Rest\FakePostAccess;
use Blixis\Builder\Storage\ContentValidator;
use Blixis\Builder\Storage\FakeDatabase;
use Blixis\Builder\Storage\LocaleMismatchException;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\RevisionContext;
use Blixis\Builder\Storage\RevisionRing;
use Blixis\Builder\Storage\StreamStore;
use PHPUnit\Framework\TestCase;

if ( ! \defined( 'ABSPATH' ) ) {
	\define( 'ABSPATH', \dirname( __DIR__ ) . '/' ); // phpcs:ignore WordPress.NamingConventions.PrefixAllGlobals.NonPrefixedConstantFound -- Test fixture.
}
require_once \dirname( __DIR__ ) . '/src/Autoloader.php';
Autoloader::register();
require_once __DIR__ . '/FakePostAccess.php';

/** Source digests match TypeScript, content is validated, locale identity is kept and translation states are computed. */
final class LocaleSavingTest extends TestCase {
	/**
	 * The shared digest corpus agrees with the TypeScript implementation.
	 */
	public function test_source_digest_corpus(): void {
		$file   = \dirname( __DIR__, 3 ) . '/packages/core/corpus/source-digest.json';
		$corpus = \json_decode( (string) \file_get_contents( $file ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents -- Local corpus file.
		$this->assertInstanceOf( \stdClass::class, $corpus );
		$this->assertGreaterThanOrEqual( 10, \count( $corpus->cases ) );
		foreach ( $corpus->cases as $case ) {
			$ids = $case->{'propertyIds'} ?? null;
			$this->assertSame( $case->expected, SourceDigest::of( $case->values, $ids ), $case->id );
		}
	}

	/**
	 * A content envelope.
	 *
	 * @param array<string, mixed> $extra Extra or replaced fields.
	 */
	private function content( array $extra = [] ): string {
		return (string) \json_encode(
			\array_merge(
				[
					'schemaVersion'   => 1,
					'contentRevision' => 1,
					'entries'         => [
						'hed-1' => [
							'status' => 'translated',
							'values' => [ 'text' => 'Hallo' ],
						],
					],
				],
				$extra
			)
		);
	}

	/** Shape and bounds of content streams are enforced; rich text and unknown keys are refused. */
	public function test_content_validation(): void {
		$validator = new ContentValidator();
		$key       = MetaKeys::content( 'nl_NL' );
		$this->assertTrue( $validator->accepts( $this->content(), $key ) );
		$this->assertTrue( $validator->accepts( $this->content( [ 'entries' => new \stdClass() ] ), $key ) );
		$entry = static fn ( array $over ): array => [
			'entries' => [
				'hed-1' => $over,
			],
		];
		$bad   = [
			'entries not an object' => [ 'entries' => [ 1, 2 ] ],
			'bad element id'        => [ 'entries' => [ 'A' => [ 'values' => [ 'text' => 'x' ] ] ] ],
			'unknown entry key'     => $entry( [ 'evil' => 1 ] ),
			'bad status'            => $entry( [ 'status' => 'published' ] ),
			'bad source hash'       => $entry( [ 'sourceHash' => 'XYZ' ] ),
			'source hash too long'  => $entry( [ 'sourceHash' => \str_repeat( 'a', 17 ) ] ),
			'values not an object'  => $entry( [ 'values' => [ 'x' ] ] ),
			'rich text array'       => $entry( [ 'values' => [ 'text' => [ 'type' => 'p' ] ] ] ),
			'float value'           => $entry( [ 'values' => [ 'n' => 1.5 ] ] ),
			'bad property name'     => $entry( [ 'values' => [ 'Text' => 'x' ] ] ),
			'string too long'       => $entry( [ 'values' => [ 'text' => \str_repeat( 'a', 20001 ) ] ] ),
		];
		foreach ( $bad as $label => $extra ) {
			$this->assertFalse( $validator->accepts( $this->content( $extra ), $key ), $label );
		}
		$many = [];
		for ( $i = 0; $i < 5001; $i++ ) {
			$many[ 'el-' . $i ] = [ 'status' => 'draft' ];
		}
		$this->assertFalse( $validator->accepts( $this->content( [ 'entries' => $many ] ), $key ), 'too many entries' );
		$values = [];
		for ( $i = 0; $i < 33; $i++ ) {
			$values[ 'p' . $i ] = 'x';
		}
		$this->assertFalse( $validator->accepts( $this->content( $entry( [ 'values' => $values ] ) ), $key ), 'too many values' );
	}

	/** A content stream keeps the identity of its locale: it is stamped, and another locale is refused. */
	public function test_locale_identity(): void {
		$database = new FakeDatabase();
		$store    = new StreamStore( $database );
		$this->assertTrue( $store->write( 5, MetaKeys::content( 'nl_NL' ), $this->content(), 0 )->success );
		$stored = \json_decode( $store->read( 5, MetaKeys::content( 'nl_NL' ) )['value'] ?? '' );
		$this->assertInstanceOf( \stdClass::class, $stored );
		$this->assertSame( 'nl_NL', $stored->locale, 'the locale is stamped on first save' );
		$this->assertTrue( $store->write( 5, MetaKeys::content( 'nl_NL' ), $this->content( [ 'locale' => 'nl_NL' ] ), 1 )->success );
		try {
			$store->write( 5, MetaKeys::content( 'nl_NL' ), $this->content( [ 'locale' => 'en_US' ] ), 2 );
			$this->fail( 'accepted another locale' );
		} catch ( LocaleMismatchException $error ) {
			$this->assertSame( 'The content belongs to another locale.', $error->getMessage() );
		}
		$this->assertSame( 2, $store->read( 5, MetaKeys::content( 'nl_NL' ) )['revision'] ?? 0, 'a refused write changes nothing' );
		$this->assertNull( $store->read( 5, MetaKeys::content( 'en_US' ) ), 'another locale stream is untouched' );
		// The layout stream carries no locale.
		$layout = (string) \json_encode(
			[
				'schemaVersion'  => 1,
				'layoutRevision' => 1,
			]
		);
		$this->assertTrue( $store->write( 5, MetaKeys::LAYOUT, $layout, 0 )->success );
		$this->assertStringNotContainsString( 'locale', $store->read( 5, MetaKeys::LAYOUT )['value'] ?? '' );
	}

	/** Autosave history and conflicts carry the locale of their stream. */
	public function test_history_and_conflicts_keep_the_locale(): void {
		$database = new FakeDatabase();
		$context  = new class() implements RevisionContext {
			/**
			 * Fixed actor.
			 *
			 * @return int
			 */
			public function user_id(): int {
				return 1;
			}

			/**
			 * Fixed time.
			 *
			 * @return string
			 */
			public function now(): string {
				return '2026-01-01T00:00:00Z';
			}
		};
		$ring     = new RevisionRing( $database, $context );
		$store    = new StreamStore( $database, null, $ring );
		$request  = new DocumentRequest( $store, new FakePostAccess(), $ring );
		$this->assertSame( 200, $request->put( 5, 'nl_NL', '"0"', $this->content(), 'application/json' )->status );
		$this->assertSame( 200, $request->put( 5, 'nl_NL', '"1"', $this->content(), 'application/json' )->status );
		$conflict = $request->put( 5, 'nl_NL', '"1"', $this->content(), 'application/json' );
		$this->assertSame( [ 409, 'blixis_conflict' ], [ $conflict->status, $conflict->error_code ] );
		$this->assertSame( 'nl_NL', $conflict->body['locale'] );
		$this->assertSame( 'nl_NL', $request->get( 5, 'nl_NL' )->body['locale'] );
		$this->assertSame( 'nl_NL', $request->revisions( 5, 'nl_NL' )->body['locale'] );
		$mismatch = $request->put( 5, 'nl_NL', '"2"', $this->content( [ 'locale' => 'fr_FR' ] ), 'application/json' );
		$this->assertSame( [ 422, 'blixis_locale_mismatch' ], [ $mismatch->status, $mismatch->error_code ] );
		$this->assertStringContainsString( '"locale":"nl_NL"', (string) $ring->fetch( 5, MetaKeys::content( 'nl_NL' ), 1 ), 'the saved history keeps the locale' );
		$this->assertSame( [], $ring->list( 5, MetaKeys::content( 'en_US' ) ), 'the other locale has no history' );
	}

	/** States: missing, draft, translated, stale after a source change, orphaned text, and non-translatable elements skipped. */
	public function test_translation_status(): void {
		$registry = ElementRegistry::from_manifest_file( \dirname( __DIR__ ) . '/data/core-elements.json' );
		$layout   = \json_decode(
			(string) \json_encode(
				[
					'root' => [
						[
							'id'       => 'sec-1',
							'type'     => 'blixis/section',
							'props'    => new \stdClass(),
							'children' => [
								[
									'id'       => 'hed-1',
									'type'     => 'blixis/heading',
									'props'    => new \stdClass(),
									'children' => [],
								],
								[
									'id'       => 'txt-1',
									'type'     => 'blixis/text',
									'props'    => new \stdClass(),
									'children' => [],
								],
								[
									'id'       => 'txt-2',
									'type'     => 'blixis/text',
									'props'    => new \stdClass(),
									'children' => [],
								],
								[
									'id'       => 'txt-3',
									'type'     => 'blixis/text',
									'props'    => new \stdClass(),
									'children' => [],
								],
							],
						],
					],
				]
			)
		);
		$source   = \json_decode(
			(string) \json_encode(
				[
					'hed-1' => [ 'values' => [ 'text' => 'Hello' ] ],
					'txt-1' => [ 'values' => [ 'text' => 'Body one CHANGED' ] ],
					'txt-2' => [ 'values' => [ 'text' => 'Body two' ] ],
					'txt-3' => [ 'values' => [ 'text' => 'Body three' ] ],
				]
			)
		);
		$hash     = static fn ( string $text ): string => SourceDigest::of( (object) [ 'text' => $text ], [ 'text' ] );
		$target   = \json_decode(
			(string) \json_encode(
				[
					'hed-1'  => [
						'status'     => 'reviewed',
						'values'     => [ 'text' => 'Hallo' ],
						'sourceHash' => $hash( 'Hello' ),
					],
					'txt-1'  => [
						'status'     => 'translated',
						'values'     => [ 'text' => 'Inhoud een' ],
						'sourceHash' => $hash( 'Body one' ),
					],
					'txt-2'  => [
						'status' => 'draft',
						'values' => [ 'text' => 'Inhoud twee' ],
					],
					'gone-1' => [
						'status' => 'translated',
						'values' => [ 'text' => 'Weg' ],
					],
				]
			)
		);
		$this->assertInstanceOf( \stdClass::class, $layout );
		$result = TranslationStatus::compute( $layout, $source, $target, $registry );
		$states = \array_map( static fn ( array $e ): string => $e['state'], $result['elements'] );
		$this->assertSame(
			[
				'hed-1'  => 'reviewed',
				'txt-1'  => 'stale',
				'txt-2'  => 'draft',
				'txt-3'  => 'missing',
				'gone-1' => 'orphaned',
			],
			$states
		);
		$this->assertTrue( $result['elements']['txt-1']['sourceChanged'] );
		$this->assertArrayNotHasKey( 'sec-1', $result['elements'], 'elements without translatable properties are skipped' );
		$this->assertSame(
			[
				'draft'    => 1,
				'missing'  => 1,
				'orphaned' => 1,
				'reviewed' => 1,
				'stale'    => 1,
			],
			$result['counts']
		);
	}
}
