<?php
/**
 * Reads the published state of a post and nothing else.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);

namespace Blixis\Builder\Frontend;

use Blixis\Builder\Preview\PreviewDocument;
use Blixis\Builder\Render\RenderDocument;
use Blixis\Builder\Storage\Database;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\MetaKeys;

\defined( 'ABSPATH' ) || exit;

/**
 * Resolves the publication pointer to immutable snapshots (ADR 0004). Working streams are never read, so drafts cannot
 * reach visitors. Any missing or invalid piece makes the post "not published by the builder" (null), never a partial page.
 */
final class PublishedReader {
	/** Last content-free failure slug.
	 *
	 * @var ?string
	 */
	private ?string $last_failure_reason = null;
	/**
	 * Create a reader.
	 *
	 * @param Database $database Storage.
	 */
	public function __construct( private readonly Database $database ) {}

	/**
	 * Read the published document for a locale.
	 *
	 * The requested locale is used when it has a published content snapshot; otherwise the pointer's default locale.
	 * A pointer without locales renders the layout with the element defaults.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $locale Requested locale.
	 * @return ?PublishedDocument
	 */
	public function read( int $post_id, string $locale ): ?PublishedDocument {
		$this->last_failure_reason = null;
		if ( $post_id < 1 || ! MetaKeys::is_valid_locale( $locale ) ) {
			return $this->failed( $post_id, 'invalid_request' );
		}
		$pointer = $this->envelope( $post_id, MetaKeys::PUBLISHED );
		if ( null === $pointer || ! \is_int( $pointer->{'publishedLayoutRevision'} ?? null ) || $pointer->{'publishedLayoutRevision'} < 1 ) {
			return $this->failed( $post_id, 'invalid_pointer' );
		}
		$selected        = $this->select_locale( $pointer, $locale );
		$layout_revision = $pointer->{'publishedLayoutRevision'};
		// A locale renders against the layout it was published with (its pinned base layout), not necessarily the newest one.
		if ( null !== $selected && \is_int( $selected[1]->{'baseLayout'} ?? null ) && $selected[1]->{'baseLayout'} > 0 ) {
			$layout_revision = $selected[1]->{'baseLayout'};
		}
		$layout = $this->envelope( $post_id, MetaKeys::snap_layout( $layout_revision ) );
		if ( null === $layout || ! PreviewDocument::accepts( $layout ) ) {
			return $this->failed( $post_id, null === $layout ? 'layout_snapshot_missing' : 'layout_invalid' );
		}
		if ( null === $selected ) {
			return new PublishedDocument( $layout, $locale, $layout_revision, 0 );
		}
		[ $selected_locale, $entry ] = $selected;
		$content_revision            = $entry->{'contentSnapshot'} ?? null;
		if ( ! \is_int( $content_revision ) || $content_revision < 1 ) {
			return new PublishedDocument( $layout, $selected_locale, $layout_revision, 0 );
		}
		$content = $this->envelope( $post_id, MetaKeys::snap_content( $selected_locale, $content_revision ) );
		// Locale identity: a content snapshot that names another locale is corrupt and never rendered.
		if ( null === $content || ( \property_exists( $content, 'locale' ) && $content->locale !== $selected_locale ) ) {
			return $this->failed( $post_id, null === $content ? 'content_snapshot_missing' : 'content_locale_mismatch' );
		}
		$streams          = [ $selected_locale => $content ];
		$default_locale   = $pointer->{'defaultLocale'} ?? null;
		$default_revision = 0;
		// The default locale's content is the fallback source for missing translations (policy `source`).
		if ( \is_string( $default_locale ) && $default_locale !== $selected_locale && MetaKeys::is_valid_locale( $default_locale ) ) {
			$default_entry = ( $pointer->locales ?? null ) instanceof \stdClass ? ( $pointer->locales->$default_locale ?? null ) : null;
			$number        = $default_entry instanceof \stdClass ? ( $default_entry->{'contentSnapshot'} ?? null ) : null;
			$source        = \is_int( $number ) && $number > 0 ? $this->envelope( $post_id, MetaKeys::snap_content( $default_locale, $number ) ) : null;
			if ( null !== $source ) {
				$streams[ $default_locale ] = $source;
				$default_revision           = (int) $number;
			}
		}
		$merged = RenderDocument::from_streams( $layout, $streams );
		if ( \is_string( $default_locale ) ) {
			$merged->{'defaultLocale'} = $default_locale;
		}
		return new PublishedDocument( $merged, $selected_locale, $layout_revision, $content_revision, $default_revision );
	}

	/** Return the last content-free read failure slug for diagnostics. */
	public function last_failure_reason(): ?string {
		return $this->last_failure_reason;
	}

	/** Record and expose a content-free published-read failure.
	 *
	 * @param int    $post_id Post ID.
	 * @param string $reason Failure slug.
	 */
	private function failed( int $post_id, string $reason ): null {
		$this->last_failure_reason = $reason;
		if ( \function_exists( 'do_action' ) ) {
			\do_action( 'blixis_builder_published_read_failed', $post_id, $reason );
		}
		if ( \defined( 'WP_DEBUG' ) && WP_DEBUG && ! isset( $GLOBALS['blixis_builder_published_read_failures'][ $post_id ] ) ) {
			$GLOBALS['blixis_builder_published_read_failures'][ $post_id ] = true;
			\error_log( 'Blixis published read failed (' . $reason . ') for post ' . $post_id ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log -- Content-free diagnostic, once per request.
		}
		return null;
	}

	/**
	 * Locales that currently have published content for a post (their content snapshot exists).
	 *
	 * @param int $post_id Post ID.
	 * @return list<string>
	 */
	public function published_locales( int $post_id ): array {
		$pointer = $post_id < 1 ? null : $this->envelope( $post_id, MetaKeys::PUBLISHED );
		if ( null === $pointer || ! ( $pointer->locales ?? null ) instanceof \stdClass ) {
			return [];
		}
		$out = [];
		foreach ( \get_object_vars( $pointer->locales ) as $locale => $entry ) {
			$locale = (string) $locale;
			if ( MetaKeys::is_valid_locale( $locale ) && $entry instanceof \stdClass && \is_int( $entry->{'contentSnapshot'} ?? null ) && $entry->{'contentSnapshot'} > 0 && null !== $this->envelope( $post_id, MetaKeys::snap_content( $locale, $entry->{'contentSnapshot'} ) ) ) {
				$out[] = $locale;
			}
		}
		return $out;
	}

	/**
	 * Pick the locale entry to render.
	 *
	 * @param \stdClass $pointer Publication pointer.
	 * @param string    $locale Requested locale.
	 * @return ?array{0: string, 1: \stdClass}
	 */
	private function select_locale( \stdClass $pointer, string $locale ): ?array {
		$locales = $pointer->locales ?? null;
		if ( ! $locales instanceof \stdClass ) {
			return null;
		}
		$default = $pointer->{'defaultLocale'} ?? null;
		foreach ( [ $locale, \is_string( $default ) ? $default : '' ] as $candidate ) {
			if ( '' !== $candidate && MetaKeys::is_valid_locale( $candidate ) && ( $locales->$candidate ?? null ) instanceof \stdClass ) {
				return [ $candidate, $locales->$candidate ];
			}
		}
		return null;
	}

	/**
	 * Read and validate one stored envelope (a pointer or a snapshot row).
	 *
	 * @param int    $post_id Post ID.
	 * @param string $key Meta key.
	 * @return ?\stdClass
	 */
	private function envelope( int $post_id, string $key ): ?\stdClass {
		$rows = $this->database->rows( $post_id, $key );
		if ( 1 !== \count( $rows ) ) {
			return null;
		}
		return Envelope::decode( $rows[0]['value'], $key );
	}
}
