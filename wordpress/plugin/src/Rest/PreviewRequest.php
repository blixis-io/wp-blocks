<?php
/**
 * Transport-neutral preview request policy.
 *
 * @package Blixis\Builder
 */

declare(strict_types=1);
namespace Blixis\Builder\Rest;

use Blixis\Builder\Preview\PreviewDocument;
use Blixis\Builder\Preview\PreviewRenderer;
use Blixis\Builder\Preview\PreviewResult;
use Blixis\Builder\Render\RenderDocument;
use Blixis\Builder\Storage\DocumentValidator;
use Blixis\Builder\Storage\Envelope;
use Blixis\Builder\Storage\MetaKeys;
use Blixis\Builder\Storage\StreamStore;

\defined( 'ABSPATH' ) || exit;

/** Reads only the selected post's working streams and never persists preview input. */
final class PreviewRequest {
	/** Construct the policy.
	 *
	 * @param DocumentRequest   $documents Permission policy.
	 * @param StreamStore       $streams Working streams.
	 * @param DocumentValidator $validator Envelope validator.
	 * @param PreviewRenderer   $renderer Renderer.
	 * @param SiteLocale        $site_locale Site locale adapter.
	 */
	public function __construct( private DocumentRequest $documents, private StreamStore $streams, private DocumentValidator $validator, private PreviewRenderer $renderer, private SiteLocale $site_locale ) {}

	/** Process a JSON request after WordPress has run permission_callback and cookie nonce checks.
	 *
	 * @param int    $post_id Target post ID.
	 * @param string $body Request JSON.
	 * @param string $content_type Content type.
	 */
	public function preview( int $post_id, string $body, string $content_type ): DocumentResult {
		$denied = $this->documents->permission( $post_id );
		if ( null !== $denied ) {
			return $denied;
		}
		if ( \strlen( $body ) > Envelope::MAX_BYTES ) {
			return DocumentResult::error( 413, 'blixis_too_large', 'Preview request is too large.' );
		}
		if ( 1 !== \preg_match( '~^application/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$~iD', $content_type ) ) {
			return self::invalid_document();
		}
		try {
			$input = \json_decode( $body, false, 128, JSON_THROW_ON_ERROR );
		} catch ( \JsonException $exception ) {
			return self::invalid_document();
		}
		if ( ! $input instanceof \stdClass ) {
			return self::invalid_document();
		}
		$locale = \property_exists( $input, 'locale' ) ? $input->locale : $this->site_locale->default_locale();
		$mode   = \property_exists( $input, 'mode' ) ? $input->mode : 'light';
		if ( ! \is_string( $locale ) || ! MetaKeys::is_valid_locale( $locale ) ) {
			return DocumentResult::error( 400, 'blixis_invalid_locale', 'Invalid locale.' );
		}
		if ( ! \is_string( $mode ) || ! \in_array( $mode, [ 'light', 'dark' ], true ) ) {
			return DocumentResult::error( 400, 'blixis_invalid_mode', 'Invalid mode.' );
		}
		try {
			$source           = 'request';
			$layout_revision  = null;
			$content_revision = null;
			if ( \property_exists( $input, 'document' ) ) {
				$document = $input->document;
				if ( ! $document instanceof \stdClass || ! $this->valid_document( $document ) ) {
					return self::invalid_document();
				}
				$layout_revision  = $document->{'layoutRevision'};
				$content_revision = isset( $document->{'contentRevision'} ) && \is_int( $document->{'contentRevision'} ) ? $document->{'contentRevision'} : null;
			} else {
				$source           = 'working';
				$layout           = $this->streams->read( $post_id, MetaKeys::LAYOUT );
				$content          = $this->streams->read( $post_id, MetaKeys::content( $locale ) );
				$layout_revision  = $layout['revision'] ?? null;
				$content_revision = $content['revision'] ?? null;
				$document         = null === $layout ? null : Envelope::decode( $layout['value'], MetaKeys::LAYOUT );
				if ( null !== $layout && ( null === $document || ! $this->valid_document( $document ) ) ) {
					return self::failed();
				}
				if ( null !== $content && ! $this->validator->accepts( $content['value'], MetaKeys::content( $locale ) ) ) {
					return self::failed();
				}
				if ( null !== $document ) {
					$content_by_locale = [];
					if ( null !== $content ) {
						$stream = Envelope::decode( $content['value'], MetaKeys::content( $locale ) );
						if ( null !== $stream ) {
							$content_by_locale[ $locale ] = $stream;
						}
					}
					$default_locale = $document->{'defaultLocale'} ?? null;
					if ( \is_string( $default_locale ) && $default_locale !== $locale && MetaKeys::is_valid_locale( $default_locale ) ) {
						$default_content = $this->streams->read( $post_id, MetaKeys::content( $default_locale ) );
						if ( null !== $default_content ) {
							if ( ! $this->validator->accepts( $default_content['value'], MetaKeys::content( $default_locale ) ) ) {
								return self::failed();
							}
							$stream = Envelope::decode( $default_content['value'], MetaKeys::content( $default_locale ) );
							if ( null !== $stream ) {
								$content_by_locale[ $default_locale ] = $stream;
							}
						}
					}
					$document = RenderDocument::from_streams( $document, $content_by_locale );
				}
			}
			$output = null === $document ? new PreviewResult( '', '' ) : new PreviewResult( ...$this->render_output( $document, $locale, $mode ) );
			return DocumentResult::success(
				[
					'html'            => $output->html,
					'css'             => $output->css,
					'locale'          => $locale,
					'mode'            => $mode,
					'layoutRevision'  => $layout_revision,
					'contentRevision' => $content_revision,
					'source'          => $source,
				],
				0
			);
		} catch ( \Throwable $exception ) {
			return self::failed();
		}
	}

	/** Render through the selected renderer.
	 *
	 * @param \stdClass $document Validated document.
	 * @param string    $locale Content locale.
	 * @param string    $mode Website mode.
	 * @return array{string,string} HTML and CSS.
	 */
	private function render_output( \stdClass $document, string $locale, string $mode ): array {
		$output = $this->renderer->render( $document, $locale, $mode );
		return [ $output->html, $output->css ];
	}

	/** Check the envelope and element tree.
	 *
	 * @param \stdClass $document Untrusted document.
	 */
	private function valid_document( \stdClass $document ): bool {
		try {
			$json = \json_encode( $document, JSON_THROW_ON_ERROR ); // phpcs:ignore WordPress.WP.AlternativeFunctions.json_encode_json_encode -- Pure validation boundary.
		} catch ( \JsonException $exception ) {
			return false;
		}
		return \strlen( $json ) <= Envelope::MAX_BYTES && $this->validator->accepts( $json, MetaKeys::LAYOUT ) && PreviewDocument::accepts( $document );
	}

	/** Return a safe document error. */
	private static function invalid_document(): DocumentResult {
		return DocumentResult::error( 422, 'blixis_invalid_document', 'Invalid document.' );
	}

	/** Return a safe renderer or storage error. */
	private static function failed(): DocumentResult {
		return DocumentResult::error( 500, 'blixis_preview_failed', 'Preview failed.' );
	}
}
