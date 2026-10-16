<?php
/**
 * Reads working layout and content streams for an authorized front-end draft preview.
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

/** Resolves current working streams. This reader is only used after DraftPreview authorization. */
final class WorkingReader {
	/**
	 * Create a reader.
	 *
	 * @param Database $database Storage.
	 */
	public function __construct( private readonly Database $database ) {}

	/**
	 * Read the current working document for a locale, falling back to the working default locale.
	 *
	 * @param int    $post_id Post id.
	 * @param string $locale Requested content locale.
	 * @param string $default_locale Default content locale.
	 */
	public function read( int $post_id, string $locale, string $default_locale ): ?PublishedDocument {
		if ( $post_id < 1 || ! MetaKeys::is_valid_locale( $locale ) || ! MetaKeys::is_valid_locale( $default_locale ) ) {
			return null;
		}
		$layout_rows = $this->database->rows( $post_id, MetaKeys::LAYOUT );
		$layout      = 1 === count( $layout_rows ) ? Envelope::decode( $layout_rows[0]['value'], MetaKeys::LAYOUT ) : null;
		if ( null === $layout || ! PreviewDocument::accepts( $layout ) ) {
			return null;
		}
		$streams   = [];
		$revisions = [];
		foreach ( array_values( array_unique( [ $locale, $default_locale ] ) ) as $candidate ) {
			$key  = MetaKeys::content( $candidate );
			$rows = $this->database->rows( $post_id, $key );
			if ( 1 !== count( $rows ) ) {
				continue;
			}
			$content = Envelope::decode( $rows[0]['value'], $key );
			if ( null !== $content && ( ! property_exists( $content, 'locale' ) || $content->locale === $candidate ) ) {
				$streams[ $candidate ]   = $content;
				$revisions[ $candidate ] = Envelope::revision( $rows[0]['value'], $key ) ?? 0;
			}
		}
		$merged                    = RenderDocument::from_streams( $layout, $streams );
		$merged->{'defaultLocale'} = $default_locale;
		$selected                  = isset( $streams[ $locale ] ) ? $locale : ( isset( $streams[ $default_locale ] ) ? $default_locale : $locale );
		return new PublishedDocument( $merged, $selected, Envelope::revision( $layout_rows[0]['value'], MetaKeys::LAYOUT ) ?? 0, $revisions[ $selected ] ?? 0, $revisions[ $default_locale ] ?? 0 );
	}
}
